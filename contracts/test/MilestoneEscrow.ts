import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("MilestoneEscrow", function () {
  async function deployEscrowFixture() {
    const [employer, employee, arbiter, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("MilestoneEscrow");
    const now = await networkHelpers.time.latest();

    const descriptions = ["Design mockups", "Build frontend"];
    const amounts = [ethers.parseEther("1"), ethers.parseEther("2")];
    const deadlines = [BigInt(now + 7 * 24 * 60 * 60), BigInt(now + 14 * 24 * 60 * 60)];
    const reviewWindow = BigInt(3 * 24 * 60 * 60);
    const maxRejections = 2;
    const total = amounts[0] + amounts[1];

    return {
      escrow,
      employer,
      employee,
      arbiter,
      other,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    };
  }

  it("creates a funded agreement and stores the deposit", async function () {
    const {
      escrow,
      employer,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    )
      .to.emit(escrow, "AgreementCreated")
      .withArgs(
        0n,
        employer.address,
        employee.address,
        arbiter.address,
        total,
        2n,
      );

    expect(await escrow.agreementCount()).to.equal(1n);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
      total,
    );

    const agreement = await escrow.getAgreement(0n);
    expect(agreement.employer).to.equal(employer.address);
    expect(agreement.employee).to.equal(employee.address);
    expect(agreement.arbiter).to.equal(arbiter.address);
    expect(agreement.reviewWindow).to.equal(reviewWindow);
    expect(agreement.maxRejections).to.equal(maxRejections);
    expect(agreement.totalDeposited).to.equal(total);
    expect(agreement.cancelled).to.equal(false);

    expect(await escrow.milestoneCount(0n)).to.equal(2n);

    const first = await escrow.getMilestone(0n, 0n);
    expect(first.description).to.equal(descriptions[0]);
    expect(first.amount).to.equal(amounts[0]);
    expect(first.workDeadline).to.equal(deadlines[0]);
    expect(first.proofHash).to.equal(ethers.ZeroHash);
    expect(first.submittedAt).to.equal(0n);
    expect(first.rejectionCount).to.equal(0);
    expect(first.isExtra).to.equal(false);
    expect(first.status).to.equal(0); // Funded

    const second = await escrow.getMilestone(0n, 1n);
    expect(second.description).to.equal(descriptions[1]);
    expect(second.amount).to.equal(amounts[1]);
    expect(second.workDeadline).to.equal(deadlines[1]);
    expect(second.status).to.equal(0);
  });

  it("reverts when msg.value does not equal the sum of amounts", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total - 1n },
      ),
    )
      .to.be.revertedWithCustomError(escrow, "IncorrectDeposit")
      .withArgs(total - 1n, total);
  });

  it("reverts when milestone arrays are empty", async function () {
    const { escrow, employee, arbiter, reviewWindow, maxRejections } =
      await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        [],
        [],
        [],
        { value: 0n },
      ),
    ).to.be.revertedWithCustomError(escrow, "EmptyMilestones");
  });

  it("reverts when milestone arrays have different lengths", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        [amounts[0]],
        deadlines,
        { value: amounts[0] },
      ),
    ).to.be.revertedWithCustomError(escrow, "ArrayLengthMismatch");
  });

  it("reverts when there are more than 10 milestones", async function () {
    const { escrow, employee, arbiter, reviewWindow, maxRejections } =
      await networkHelpers.loadFixture(deployEscrowFixture);

    const now = await networkHelpers.time.latest();
    const descriptions = Array.from({ length: 11 }, (_, i) => `Task ${i}`);
    const amounts = Array.from({ length: 11 }, () => ethers.parseEther("0.1"));
    const deadlines = Array.from({ length: 11 }, (_, i) =>
      BigInt(now + (i + 1) * 24 * 60 * 60),
    );
    const total = amounts.reduce((sum, amount) => sum + amount, 0n);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    )
      .to.be.revertedWithCustomError(escrow, "TooManyMilestones")
      .withArgs(11n);
  });

  it("reverts when any milestone amount is 0", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    const badAmounts = [amounts[0], 0n];

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        badAmounts,
        deadlines,
        { value: amounts[0] },
      ),
    )
      .to.be.revertedWithCustomError(escrow, "ZeroAmount")
      .withArgs(1n);
  });

  it("reverts when any deadline is not in the future", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    const now = await networkHelpers.time.latest();
    const pastDeadlines = [deadlines[0], BigInt(now)];

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        pastDeadlines,
        { value: total },
      ),
    )
      .to.be.revertedWithCustomError(escrow, "DeadlineNotInFuture")
      .withArgs(1n, BigInt(now));
  });

  it("reverts when employee or arbiter is the zero address", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        ethers.ZeroAddress,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "ZeroAddress");

    await expect(
      escrow.createAgreement(
        employee.address,
        ethers.ZeroAddress,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
  });

  it("reverts when employer, employee, and arbiter are not three different addresses", async function () {
    const {
      escrow,
      employer,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employer.address,
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "PartiesMustBeDistinct");

    await expect(
      escrow.createAgreement(
        employee.address,
        employee.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "PartiesMustBeDistinct");
  });

  it("reverts when reviewWindow is 0", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      maxRejections,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        0n,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "ZeroReviewWindow");
  });

  it("reverts when maxRejections is 0", async function () {
    const {
      escrow,
      employee,
      arbiter,
      descriptions,
      amounts,
      deadlines,
      reviewWindow,
      total,
    } = await networkHelpers.loadFixture(deployEscrowFixture);

    await expect(
      escrow.createAgreement(
        employee.address,
        arbiter.address,
        reviewWindow,
        0,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      ),
    ).to.be.revertedWithCustomError(escrow, "ZeroMaxRejections");
  });
});
