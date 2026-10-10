// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

/// @title MilestoneEscrow
/// @notice Holds MON for freelance jobs split into milestones. The employer
///         funds on create; the employee submits proof; the employer can
///         approve, reject (with a resubmit window), or let a timeout pay the
///         employee. Arbiter dispute handling comes later.
contract MilestoneEscrow {
    // This chunk uses Funded, Submitted, Rejected, Disputed, Approved, AutoReleased.
    enum MilestoneStatus {
        Funded,
        Submitted,
        Rejected,
        Disputed,
        Approved,
        AutoReleased,
        Resolved,
        Expired,
        Cancelled
    }

    // One piece of work inside an agreement.
    struct Milestone {
        string description;
        uint256 amount;
        uint256 workDeadline;
        bytes32 proofHash;
        uint256 submittedAt;
        uint8 rejectionCount;
        bool isExtra;
        MilestoneStatus status;
    }

    // The job itself: who pays, who works, who can later settle a dispute.
    struct Agreement {
        address employer;
        address employee;
        address arbiter;
        uint256 reviewWindow;
        uint8 maxRejections;
        uint256 totalDeposited;
        bool cancelled;
    }

    uint256 public constant MAX_MILESTONES = 10;

    uint256 public agreementCount;
    // Simple lock so payout functions cannot be nested in the same transaction.
    bool private _locked;

    mapping(uint256 => Agreement) private _agreements;
    mapping(uint256 => Milestone[]) private _milestones;

    event AgreementCreated(
        uint256 indexed id,
        address indexed employer,
        address indexed employee,
        address arbiter,
        uint256 totalDeposited,
        uint256 milestoneCount
    );
    event WorkSubmitted(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        bytes32 proofHash,
        uint256 submittedAt
    );
    event Approved(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed employee,
        uint256 amount
    );
    event Rejected(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        bytes32 reasonHash,
        uint8 rejectionCount,
        bool escalatedToDispute
    );
    event AutoReleased(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed employee,
        uint256 amount
    );

    error IncorrectDeposit(uint256 sent, uint256 required);
    error EmptyMilestones();
    error ArrayLengthMismatch();
    error TooManyMilestones(uint256 count);
    error ZeroAmount(uint256 index);
    error DeadlineNotInFuture(uint256 index, uint256 deadline);
    error ZeroAddress();
    error PartiesMustBeDistinct();
    error ZeroReviewWindow();
    error ZeroMaxRejections();
    error InvalidAgreement(uint256 id);
    error InvalidMilestone(uint256 id, uint256 index);
    error NotEmployee();
    error NotEmployer();
    error AgreementCancelled(uint256 id);
    error WrongStatus(MilestoneStatus current, MilestoneStatus required);
    error DeadlinePassed(uint256 deadline);
    error EmptyProof();
    error EmptyReason();
    error ReviewWindowClosed(uint256 closesAt);
    error ReviewWindowStillOpen(uint256 closesAt);
    error TransferFailed();
    error Reentrant();

    /// @notice Employer starts a job and sends the full milestone budget in MON.
    /// @dev msg.sender becomes the employer. ETH (MON on Monad) stays in this contract.
    function createAgreement(
        address employee,
        address arbiter,
        uint256 reviewWindow,
        uint8 maxRejections,
        string[] calldata descriptions,
        uint256[] calldata amounts,
        uint256[] calldata deadlines
    ) external payable returns (uint256 id) {
        _assertParties(employee, arbiter);
        if (reviewWindow == 0) {
            revert ZeroReviewWindow();
        }
        if (maxRejections == 0) {
            revert ZeroMaxRejections();
        }

        uint256 total = _assertMilestones(descriptions, amounts, deadlines);
        if (msg.value != total) {
            revert IncorrectDeposit(msg.value, total);
        }

        id = agreementCount;
        agreementCount = id + 1;

        _agreements[id] = Agreement({
            employer: msg.sender,
            employee: employee,
            arbiter: arbiter,
            reviewWindow: reviewWindow,
            maxRejections: maxRejections,
            totalDeposited: total,
            cancelled: false
        });

        _storeMilestones(id, descriptions, amounts, deadlines);

        emit AgreementCreated(
            id,
            msg.sender,
            employee,
            arbiter,
            total,
            descriptions.length
        );
    }

    /// @notice Freelancer records a proof hash before the work deadline.
    ///         First submit is from Funded; a later submit is from Rejected.
    function submitWork(
        uint256 agreementId,
        uint256 milestoneId,
        bytes32 proofHash
    ) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.cancelled) {
            revert AgreementCancelled(agreementId);
        }
        if (msg.sender != agreement.employee) {
            revert NotEmployee();
        }
        if (proofHash == bytes32(0)) {
            revert EmptyProof();
        }

        Milestone storage milestone = _requireMilestone(agreementId, milestoneId);
        if (
            milestone.status != MilestoneStatus.Funded &&
            milestone.status != MilestoneStatus.Rejected
        ) {
            revert WrongStatus(milestone.status, MilestoneStatus.Funded);
        }
        if (block.timestamp > milestone.workDeadline) {
            revert DeadlinePassed(milestone.workDeadline);
        }

        milestone.proofHash = proofHash;
        milestone.submittedAt = block.timestamp;
        milestone.status = MilestoneStatus.Submitted;

        emit WorkSubmitted(agreementId, milestoneId, proofHash, block.timestamp);
    }

    /// @notice Employer accepts submitted work and pays that milestone in MON.
    function approve(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.cancelled) {
            revert AgreementCancelled(agreementId);
        }
        if (msg.sender != agreement.employer) {
            revert NotEmployer();
        }

        Milestone storage milestone = _requireMilestone(agreementId, milestoneId);
        if (milestone.status != MilestoneStatus.Submitted) {
            revert WrongStatus(milestone.status, MilestoneStatus.Submitted);
        }

        uint256 amount = milestone.amount;
        address employee = agreement.employee;
        // Mark paid before sending so a re-entry cannot pay twice.
        milestone.status = MilestoneStatus.Approved;

        emit Approved(agreementId, milestoneId, employee, amount);

        (bool ok, ) = employee.call{value: amount}("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    /// @notice Employer turns work back. After maxRejections the milestone
    ///         waits for the arbiter. Otherwise the freelancer gets one more
    ///         review window to resubmit.
    function reject(
        uint256 agreementId,
        uint256 milestoneId,
        bytes32 reasonHash
    ) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.cancelled) {
            revert AgreementCancelled(agreementId);
        }
        if (msg.sender != agreement.employer) {
            revert NotEmployer();
        }
        if (reasonHash == bytes32(0)) {
            revert EmptyReason();
        }

        Milestone storage milestone = _requireMilestone(agreementId, milestoneId);
        if (milestone.status != MilestoneStatus.Submitted) {
            revert WrongStatus(milestone.status, MilestoneStatus.Submitted);
        }

        uint256 windowEnd = milestone.submittedAt + agreement.reviewWindow;
        if (block.timestamp > windowEnd) {
            revert ReviewWindowClosed(windowEnd);
        }

        uint8 newCount = milestone.rejectionCount + 1;
        milestone.rejectionCount = newCount;

        bool escalated = newCount >= agreement.maxRejections;
        if (escalated) {
            milestone.status = MilestoneStatus.Disputed;
        } else {
            milestone.status = MilestoneStatus.Rejected;
            milestone.workDeadline = block.timestamp + agreement.reviewWindow;
        }

        emit Rejected(
            agreementId,
            milestoneId,
            reasonHash,
            newCount,
            escalated
        );
    }

    /// @notice If the employer neither approves nor rejects in time, anyone
    ///         can release this milestone to the employee.
    function claimAfterTimeout(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.cancelled) {
            revert AgreementCancelled(agreementId);
        }

        Milestone storage milestone = _requireMilestone(agreementId, milestoneId);
        if (milestone.status != MilestoneStatus.Submitted) {
            revert WrongStatus(milestone.status, MilestoneStatus.Submitted);
        }

        uint256 windowEnd = milestone.submittedAt + agreement.reviewWindow;
        if (block.timestamp <= windowEnd) {
            revert ReviewWindowStillOpen(windowEnd);
        }

        uint256 amount = milestone.amount;
        address employee = agreement.employee;
        milestone.status = MilestoneStatus.AutoReleased;

        emit AutoReleased(agreementId, milestoneId, employee, amount);

        (bool ok, ) = employee.call{value: amount}("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    modifier nonReentrant() {
        if (_locked) {
            revert Reentrant();
        }
        _locked = true;
        _;
        _locked = false;
    }

    function _requireAgreement(
        uint256 id
    ) private view returns (Agreement storage agreement) {
        if (id >= agreementCount) {
            revert InvalidAgreement(id);
        }
        agreement = _agreements[id];
    }

    function _requireMilestone(
        uint256 id,
        uint256 index
    ) private view returns (Milestone storage milestone) {
        if (id >= agreementCount) {
            revert InvalidAgreement(id);
        }
        if (index >= _milestones[id].length) {
            revert InvalidMilestone(id, index);
        }
        milestone = _milestones[id][index];
    }

    function _assertParties(address employee, address arbiter) private view {
        if (employee == address(0) || arbiter == address(0)) {
            revert ZeroAddress();
        }
        if (
            msg.sender == employee || msg.sender == arbiter || employee == arbiter
        ) {
            revert PartiesMustBeDistinct();
        }
    }

    function _assertMilestones(
        string[] calldata descriptions,
        uint256[] calldata amounts,
        uint256[] calldata deadlines
    ) private view returns (uint256 total) {
        uint256 count = descriptions.length;
        if (count == 0) {
            revert EmptyMilestones();
        }
        if (count != amounts.length || count != deadlines.length) {
            revert ArrayLengthMismatch();
        }
        if (count > MAX_MILESTONES) {
            revert TooManyMilestones(count);
        }

        for (uint256 i = 0; i < count; i++) {
            if (amounts[i] == 0) {
                revert ZeroAmount(i);
            }
            if (deadlines[i] <= block.timestamp) {
                revert DeadlineNotInFuture(i, deadlines[i]);
            }
            total += amounts[i];
        }
    }

    function _storeMilestones(
        uint256 id,
        string[] calldata descriptions,
        uint256[] calldata amounts,
        uint256[] calldata deadlines
    ) private {
        Milestone[] storage stored = _milestones[id];
        for (uint256 i = 0; i < descriptions.length; i++) {
            stored.push(
                Milestone({
                    description: descriptions[i],
                    amount: amounts[i],
                    workDeadline: deadlines[i],
                    proofHash: bytes32(0),
                    submittedAt: 0,
                    rejectionCount: 0,
                    isExtra: false,
                    status: MilestoneStatus.Funded
                })
            );
        }
    }

    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return _requireAgreement(id);
    }

    function milestoneCount(uint256 id) external view returns (uint256) {
        if (id >= agreementCount) {
            revert InvalidAgreement(id);
        }
        return _milestones[id].length;
    }

    function getMilestone(
        uint256 id,
        uint256 index
    ) external view returns (Milestone memory) {
        return _requireMilestone(id, index);
    }
}
