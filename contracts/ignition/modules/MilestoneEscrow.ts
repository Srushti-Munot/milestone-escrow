import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MilestoneEscrowModule", (m) => {
  const escrow = m.contract("MilestoneEscrow");

  return { escrow };
});
