// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

/// @title MilestoneEscrow
/// @notice Holds MON for freelance jobs split into milestones. Chunk 1 only
///         creates an agreement and locks the employer's deposit. Later
///         chunks will add submit / approve / reject / dispute.
contract MilestoneEscrow {
    // How far a milestone has gone. Only Funded is used in this chunk.
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
        if (id >= agreementCount) {
            revert InvalidAgreement(id);
        }
        return _agreements[id];
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
        if (id >= agreementCount) {
            revert InvalidAgreement(id);
        }
        if (index >= _milestones[id].length) {
            revert InvalidMilestone(id, index);
        }
        return _milestones[id][index];
    }
}
