// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

interface IMilestoneEscrow {
    function submitWork(
        uint256 agreementId,
        uint256 milestoneId,
        bytes32 proofHash
    ) external;

    function approve(uint256 agreementId, uint256 milestoneId) external;
}

/// @notice Test helper: a freelancer contract that tries to call approve again
///         when it receives payment.
contract MaliciousEmployee {
    IMilestoneEscrow public immutable escrow;
    uint256 public agreementId;
    uint256 public milestoneId;
    bool public reenterFailed;

    constructor(address escrowAddress) {
        escrow = IMilestoneEscrow(escrowAddress);
    }

    function setTarget(uint256 agreementId_, uint256 milestoneId_) external {
        agreementId = agreementId_;
        milestoneId = milestoneId_;
    }

    function submit(bytes32 proofHash) external {
        escrow.submitWork(agreementId, milestoneId, proofHash);
    }

    receive() external payable {
        try escrow.approve(agreementId, milestoneId) {
            reenterFailed = false;
        } catch {
            reenterFailed = true;
        }
    }
}
