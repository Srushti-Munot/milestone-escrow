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

  async function fundedAgreementFixture() {
    const ctx = await deployEscrowFixture();
    await ctx.escrow.createAgreement(
      ctx.employee.address,
      ctx.arbiter.address,
      ctx.reviewWindow,
      ctx.maxRejections,
      ctx.descriptions,
      ctx.amounts,
      ctx.deadlines,
      { value: ctx.total },
    );
    const proofHash = ethers.id("ipfs://design-mockups");
    return { ...ctx, proofHash };
  }

  const Funded = 0;
  const Submitted = 1;
  const Rejected = 2;
  const Disputed = 3;
  const Approved = 4;
  const AutoReleased = 5;
  const Resolved = 6;
  const Expired = 7;
  const Cancelled = 8;
  const ARBITER_TIMEOUT = 3 * 24 * 60 * 60;

  async function unpaidMilestoneSum(
    escrow: Awaited<ReturnType<typeof ethers.deployContract>>,
    agreementId: bigint,
  ) {
    const count = await escrow.milestoneCount(agreementId);
    let sum = 0n;
    for (let i = 0n; i < count; i++) {
      const milestone = await escrow.getMilestone(agreementId, i);
      const status = Number(milestone.status);
      if (
        status !== Approved &&
        status !== AutoReleased &&
        status !== Resolved &&
        status !== Expired &&
        status !== Cancelled
      ) {
        sum += milestone.amount;
      }
    }
    return sum;
  }

  async function rejectUntilDisputed(
    escrow: Awaited<ReturnType<typeof ethers.deployContract>>,
    employee: Awaited<ReturnType<typeof ethers.getSigners>>[0],
    proofHash: string,
    maxRejections: number,
  ) {
    await escrow.connect(employee).submitWork(0n, 0n, proofHash);
    for (let i = 1; i < maxRejections; i++) {
      await escrow.reject(0n, 0n, ethers.id(`reject-${i}`));
      await escrow
        .connect(employee)
        .submitWork(0n, 0n, ethers.id(`ipfs://v${i + 1}`));
    }
    await escrow.reject(0n, 0n, ethers.id(`reject-${maxRejections}`));
  }

  describe("submitWork and approve", function () {
    it("lets the employee submit and the employer pay exactly that milestone", async function () {
      const {
        escrow,
        employer,
        employee,
        amounts,
        total,
        proofHash,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      const submitTx = await escrow
        .connect(employee)
        .submitWork(0n, 0n, proofHash);
      const submitReceipt = await submitTx.wait();
      const submitBlock = await ethers.provider.getBlock(
        submitReceipt!.blockNumber,
      );

      await expect(submitTx)
        .to.emit(escrow, "WorkSubmitted")
        .withArgs(0n, 0n, proofHash, submitBlock!.timestamp);

      const submitted = await escrow.getMilestone(0n, 0n);
      expect(submitted.status).to.equal(Submitted);
      expect(submitted.proofHash).to.equal(proofHash);
      expect(submitted.submittedAt).to.equal(submitBlock!.timestamp);

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      const escrowBefore = await ethers.provider.getBalance(
        await escrow.getAddress(),
      );

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.emit(escrow, "Approved")
        .withArgs(0n, 0n, employee.address, amounts[0]);

      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + amounts[0],
      );
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        escrowBefore - amounts[0],
      );

      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Approved);
      const remaining = await ethers.provider.getBalance(await escrow.getAddress());
      expect(remaining).to.equal(total - amounts[0]);
      expect(remaining).to.equal(await unpaidMilestoneSum(escrow, 0n));
    });

    it("allows only the employee to submit and only the employer to approve", async function () {
      const { escrow, employer, employee, arbiter, other, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(
        escrow.connect(employer).submitWork(0n, 0n, proofHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");
      await expect(
        escrow.connect(arbiter).submitWork(0n, 0n, proofHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");
      await expect(
        escrow.connect(other).submitWork(0n, 0n, proofHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);

      await expect(
        escrow.connect(employee).approve(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(arbiter).approve(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(other).approve(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
    });

    it("reverts submitting twice, approving before submit, and approving twice", async function () {
      const { escrow, employer, employee, amounts, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Funded, Submitted);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);

      await expect(
        escrow.connect(employee).submitWork(0n, 0n, proofHash),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Submitted, Funded);

      await escrow.connect(employer).approve(0n, 0n);
      const afterFirstPay = await ethers.provider.getBalance(
        await escrow.getAddress(),
      );

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Approved, Submitted);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        afterFirstPay,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(amounts[1]);
    });

    it("reverts submitting after the work deadline", async function () {
      const { escrow, employee, deadlines, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await networkHelpers.time.increaseTo(deadlines[0] + 1n);

      await expect(escrow.connect(employee).submitWork(0n, 0n, proofHash))
        .to.be.revertedWithCustomError(escrow, "DeadlinePassed")
        .withArgs(deadlines[0]);
    });

    it("reverts on a zero proof hash or a missing agreement or milestone", async function () {
      const { escrow, employee, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(
        escrow.connect(employee).submitWork(0n, 0n, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "EmptyProof");

      await expect(escrow.connect(employee).submitWork(99n, 0n, proofHash))
        .to.be.revertedWithCustomError(escrow, "InvalidAgreement")
        .withArgs(99n);

      await expect(escrow.connect(employee).submitWork(0n, 9n, proofHash))
        .to.be.revertedWithCustomError(escrow, "InvalidMilestone")
        .withArgs(0n, 9n);

      await expect(escrow.approve(99n, 0n))
        .to.be.revertedWithCustomError(escrow, "InvalidAgreement")
        .withArgs(99n);

      await expect(escrow.approve(0n, 9n))
        .to.be.revertedWithCustomError(escrow, "InvalidMilestone")
        .withArgs(0n, 9n);
    });

    it("keeps the contract balance equal to unpaid milestone amounts", async function () {
      const { escrow, employer, employee, amounts, total, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total,
      );

      await escrow.connect(employer).approve(0n, 0n);
      const afterFirst = total - amounts[0];
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        afterFirst,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(afterFirst);

      const secondProof = ethers.id("ipfs://frontend");
      await escrow.connect(employee).submitWork(0n, 1n, secondProof);
      await escrow.connect(employer).approve(0n, 1n);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        0n,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(0n);
    });

    it("blocks a malicious employee contract from re-entering approve", async function () {
      const { escrow, employer, arbiter, descriptions, amounts, deadlines, reviewWindow, maxRejections, total } =
        await networkHelpers.loadFixture(deployEscrowFixture);

      const attacker = await ethers.deployContract("MaliciousEmployee", [
        await escrow.getAddress(),
      ]);

      await escrow.createAgreement(
        await attacker.getAddress(),
        arbiter.address,
        reviewWindow,
        maxRejections,
        descriptions,
        amounts,
        deadlines,
        { value: total },
      );
      await attacker.setTarget(0n, 0n);
      await attacker.submit(ethers.id("ipfs://attack"));

      const attackerBalanceBefore = await ethers.provider.getBalance(
        await attacker.getAddress(),
      );

      await escrow.connect(employer).approve(0n, 0n);

      expect(await attacker.reenterFailed()).to.equal(true);
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
        attackerBalanceBefore + amounts[0],
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Approved);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Approved, Submitted);
    });
  });

  describe("reject, resubmit, and claimAfterTimeout", function () {
    it("lets the employer reject, the employee resubmit, then approve", async function () {
      const {
        escrow,
        employer,
        employee,
        amounts,
        total,
        proofHash,
        reviewWindow,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      const reasonHash = ethers.id("needs-revision");

      await expect(escrow.connect(employer).reject(0n, 0n, reasonHash))
        .to.emit(escrow, "Rejected")
        .withArgs(0n, 0n, reasonHash, 1, false);

      const afterReject = await escrow.getMilestone(0n, 0n);
      expect(afterReject.status).to.equal(Rejected);
      expect(afterReject.rejectionCount).to.equal(1);
      const rejectBlock = await ethers.provider.getBlock("latest");
      expect(afterReject.workDeadline).to.equal(
        BigInt(rejectBlock!.timestamp) + reviewWindow,
      );

      const newProof = ethers.id("ipfs://design-mockups-v2");
      const resubmitTx = await escrow
        .connect(employee)
        .submitWork(0n, 0n, newProof);
      const resubmitReceipt = await resubmitTx.wait();
      const resubmitBlock = await ethers.provider.getBlock(
        resubmitReceipt!.blockNumber,
      );

      await expect(resubmitTx)
        .to.emit(escrow, "WorkSubmitted")
        .withArgs(0n, 0n, newProof, resubmitBlock!.timestamp);

      const resubmitted = await escrow.getMilestone(0n, 0n);
      expect(resubmitted.status).to.equal(Submitted);
      expect(resubmitted.proofHash).to.equal(newProof);
      expect(resubmitted.submittedAt).to.equal(resubmitBlock!.timestamp);

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      await escrow.connect(employer).approve(0n, 0n);
      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + amounts[0],
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Approved);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);
    });

    it("allows only the employer to reject and reverts before submit or with a zero reason", async function () {
      const { escrow, employee, arbiter, other, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);
      const reasonHash = ethers.id("needs-revision");

      await expect(escrow.reject(0n, 0n, reasonHash))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Funded, Submitted);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);

      await expect(
        escrow.connect(employee).reject(0n, 0n, reasonHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(arbiter).reject(0n, 0n, reasonHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(other).reject(0n, 0n, reasonHash),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");

      await expect(
        escrow.reject(0n, 0n, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "EmptyReason");
    });

    it("reverts reject after the review window closes", async function () {
      const { escrow, employee, proofHash, reviewWindow } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      const submitted = await escrow.getMilestone(0n, 0n);
      const windowEnd = submitted.submittedAt + reviewWindow;

      await networkHelpers.time.increaseTo(windowEnd + 1n);

      await expect(
        escrow.reject(0n, 0n, ethers.id("too-late")),
      )
        .to.be.revertedWithCustomError(escrow, "ReviewWindowClosed")
        .withArgs(windowEnd);
    });

    it("reverts resubmitting after the extended work deadline", async function () {
      const { escrow, employee, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await escrow.reject(0n, 0n, ethers.id("needs-revision"));

      const rejected = await escrow.getMilestone(0n, 0n);
      await networkHelpers.time.increaseTo(rejected.workDeadline + 1n);

      await expect(
        escrow
          .connect(employee)
          .submitWork(0n, 0n, ethers.id("ipfs://too-late")),
      )
        .to.be.revertedWithCustomError(escrow, "DeadlinePassed")
        .withArgs(rejected.workDeadline);
    });

    it("sets Disputed at maxRejections and then blocks submitWork", async function () {
      const { escrow, employee, proofHash, total } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await escrow.reject(0n, 0n, ethers.id("first-reject"));

      await escrow
        .connect(employee)
        .submitWork(0n, 0n, ethers.id("ipfs://v2"));

      await expect(escrow.reject(0n, 0n, ethers.id("second-reject")))
        .to.emit(escrow, "Rejected")
        .withArgs(0n, 0n, ethers.id("second-reject"), 2, true);

      const disputed = await escrow.getMilestone(0n, 0n);
      expect(disputed.status).to.equal(Disputed);
      expect(disputed.rejectionCount).to.equal(2);
      const disputeBlock = await ethers.provider.getBlock("latest");
      expect(await escrow.disputedAt(0n, 0n)).to.equal(
        BigInt(disputeBlock!.timestamp),
      );

      await expect(
        escrow
          .connect(employee)
          .submitWork(0n, 0n, ethers.id("ipfs://v3")),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Disputed, Funded);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total);
    });

    it("lets a stranger claim after timeout exactly once, then blocks approve", async function () {
      const {
        escrow,
        employer,
        employee,
        other,
        amounts,
        total,
        proofHash,
        reviewWindow,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      const submitted = await escrow.getMilestone(0n, 0n);
      const windowEnd = submitted.submittedAt + reviewWindow;

      await expect(escrow.connect(other).claimAfterTimeout(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "ReviewWindowStillOpen")
        .withArgs(windowEnd);

      await networkHelpers.time.increaseTo(windowEnd + 1n);

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      await expect(escrow.connect(other).claimAfterTimeout(0n, 0n))
        .to.emit(escrow, "AutoReleased")
        .withArgs(0n, 0n, employee.address, amounts[0]);

      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + amounts[0],
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(AutoReleased);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);

      await expect(escrow.connect(other).claimAfterTimeout(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(AutoReleased, Submitted);

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(AutoReleased, Submitted);
    });
  });

  describe("raiseDispute, resolve, and splitAfterArbiterTimeout", function () {
    it("rejects until the cap, then the arbiter resolves with a split", async function () {
      const {
        escrow,
        employer,
        employee,
        arbiter,
        amounts,
        total,
        proofHash,
        maxRejections,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Disputed);

      const employeeShare = amounts[0] / 3n;
      const employerShare = amounts[0] - employeeShare;

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      const employerBefore = await ethers.provider.getBalance(employer.address);
      const escrowBefore = await ethers.provider.getBalance(
        await escrow.getAddress(),
      );

      await expect(
        escrow.connect(arbiter).resolve(0n, 0n, employeeShare),
      )
        .to.emit(escrow, "Resolved")
        .withArgs(0n, 0n, employeeShare, employerShare);

      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + employeeShare,
      );
      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore + employerShare,
      );
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        escrowBefore - amounts[0],
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Resolved);
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);
    });

    it("lets the arbiter give 100% to the employee or 100% to the employer", async function () {
      const {
        escrow,
        employer,
        employee,
        arbiter,
        amounts,
        total,
        proofHash,
        maxRejections,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      const employerBefore = await ethers.provider.getBalance(employer.address);

      await expect(escrow.connect(arbiter).resolve(0n, 0n, amounts[0]))
        .to.emit(escrow, "Resolved")
        .withArgs(0n, 0n, amounts[0], 0n);

      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + amounts[0],
      );
      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore,
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Resolved);
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);

      // Second milestone: reject to dispute, then 100% to employer.
      await escrow
        .connect(employee)
        .submitWork(0n, 1n, ethers.id("ipfs://frontend"));
      await escrow.reject(0n, 1n, ethers.id("m1-reject-1"));
      await escrow
        .connect(employee)
        .submitWork(0n, 1n, ethers.id("ipfs://frontend-v2"));
      await escrow.reject(0n, 1n, ethers.id("m1-reject-2"));
      expect((await escrow.getMilestone(0n, 1n)).status).to.equal(Disputed);

      const employeeMid = await ethers.provider.getBalance(employee.address);
      const employerMid = await ethers.provider.getBalance(employer.address);

      await expect(escrow.connect(arbiter).resolve(0n, 1n, 0n))
        .to.emit(escrow, "Resolved")
        .withArgs(0n, 1n, 0n, amounts[1]);

      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeMid,
      );
      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerMid + amounts[1],
      );
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        0n,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(0n);
    });

    it("lets the employee raise a dispute after one rejection, and blocks bad raises", async function () {
      const { escrow, employer, employee, arbiter, other, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(escrow.connect(employee).raiseDispute(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Funded, Rejected);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);

      await expect(escrow.connect(employee).raiseDispute(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Submitted, Rejected);

      await escrow.reject(0n, 0n, ethers.id("needs-revision"));
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Rejected);

      await expect(
        escrow.connect(employer).raiseDispute(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");
      await expect(
        escrow.connect(arbiter).raiseDispute(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");
      await expect(
        escrow.connect(other).raiseDispute(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployee");

      await expect(escrow.connect(employee).raiseDispute(0n, 0n))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(0n, 0n, employee.address);

      const afterRaise = await escrow.getMilestone(0n, 0n);
      expect(afterRaise.status).to.equal(Disputed);
      const raiseBlock = await ethers.provider.getBlock("latest");
      expect(await escrow.disputedAt(0n, 0n)).to.equal(
        BigInt(raiseBlock!.timestamp),
      );
    });

    it("reverts raiseDispute after the resubmit window", async function () {
      const { escrow, employee, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await escrow.reject(0n, 0n, ethers.id("needs-revision"));

      const rejected = await escrow.getMilestone(0n, 0n);
      await networkHelpers.time.increaseTo(rejected.workDeadline + 1n);

      await expect(escrow.connect(employee).raiseDispute(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "DeadlinePassed")
        .withArgs(rejected.workDeadline);
    });

    it("allows only the arbiter to resolve and blocks bad amounts or double resolve", async function () {
      const {
        escrow,
        employer,
        employee,
        arbiter,
        other,
        amounts,
        proofHash,
        maxRejections,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(escrow.connect(arbiter).resolve(0n, 0n, amounts[0] / 2n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Funded, Disputed);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);

      await expect(
        escrow.connect(employer).resolve(0n, 0n, amounts[0] / 2n),
      ).to.be.revertedWithCustomError(escrow, "NotArbiter");
      await expect(
        escrow.connect(employee).resolve(0n, 0n, amounts[0] / 2n),
      ).to.be.revertedWithCustomError(escrow, "NotArbiter");
      await expect(
        escrow.connect(other).resolve(0n, 0n, amounts[0] / 2n),
      ).to.be.revertedWithCustomError(escrow, "NotArbiter");

      const tooHigh = amounts[0] + 1n;
      await expect(escrow.connect(arbiter).resolve(0n, 0n, tooHigh))
        .to.be.revertedWithCustomError(escrow, "AmountTooHigh")
        .withArgs(tooHigh, amounts[0]);

      await escrow.connect(arbiter).resolve(0n, 0n, amounts[0] / 2n);

      await expect(
        escrow.connect(arbiter).resolve(0n, 0n, amounts[0] / 2n),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Resolved, Disputed);
    });

    it("early splitAfterArbiterTimeout reverts after reject reaches the cap", async function () {
      const { escrow, employee, proofHash, maxRejections } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Disputed);

      const disputedAt = await escrow.disputedAt(0n, 0n);
      expect(disputedAt).to.be.gt(0n);
      const availableAt = disputedAt + BigInt(ARBITER_TIMEOUT);

      await expect(
        escrow.connect(employee).splitAfterArbiterTimeout(0n, 0n),
      )
        .to.be.revertedWithCustomError(escrow, "TimeoutNotReached")
        .withArgs(availableAt);
    });

    it("early splitAfterArbiterTimeout reverts after raiseDispute", async function () {
      const { escrow, employee, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await escrow.reject(0n, 0n, ethers.id("needs-revision"));
      await escrow.connect(employee).raiseDispute(0n, 0n);
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Disputed);

      const disputedAt = await escrow.disputedAt(0n, 0n);
      expect(disputedAt).to.be.gt(0n);
      const availableAt = disputedAt + BigInt(ARBITER_TIMEOUT);

      await expect(
        escrow.connect(employee).splitAfterArbiterTimeout(0n, 0n),
      )
        .to.be.revertedWithCustomError(escrow, "TimeoutNotReached")
        .withArgs(availableAt);
    });

    it("splitAfterArbiterTimeout works after 3 days, blocks strangers, and handles odd amounts", async function () {
      const {
        escrow,
        employer,
        employee,
        other,
        amounts,
        total,
        proofHash,
        maxRejections,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      // Odd wei amount so amount/2 leaves a 1-wei remainder for the employer.
      const oddDescriptions = ["Odd payout task"];
      const oddAmounts = [ethers.parseEther("1") + 1n];
      const now = await networkHelpers.time.latest();
      const oddDeadlines = [BigInt(now + 7 * 24 * 60 * 60)];
      const [, , arbiter] = await ethers.getSigners();

      await escrow.createAgreement(
        employee.address,
        arbiter.address,
        BigInt(3 * 24 * 60 * 60),
        maxRejections,
        oddDescriptions,
        oddAmounts,
        oddDeadlines,
        { value: oddAmounts[0] },
      );

      const agreementId = 1n;
      await escrow
        .connect(employee)
        .submitWork(agreementId, 0n, ethers.id("ipfs://odd"));
      await escrow.reject(agreementId, 0n, ethers.id("odd-r1"));
      await escrow
        .connect(employee)
        .submitWork(agreementId, 0n, ethers.id("ipfs://odd-v2"));
      await escrow.reject(agreementId, 0n, ethers.id("odd-r2"));

      const disputedAt = await escrow.disputedAt(agreementId, 0n);
      const availableAt = disputedAt + BigInt(ARBITER_TIMEOUT);

      // increaseTo mines a block at that timestamp, so the next tx is later.
      // Call before any travel to prove the timeout still holds.
      await expect(
        escrow.connect(employee).splitAfterArbiterTimeout(agreementId, 0n),
      )
        .to.be.revertedWithCustomError(escrow, "TimeoutNotReached")
        .withArgs(availableAt);

      await networkHelpers.time.increaseTo(availableAt + 1n);

      await expect(
        escrow.connect(other).splitAfterArbiterTimeout(agreementId, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotParty");

      const employeeShare = oddAmounts[0] / 2n;
      const employerShare = oddAmounts[0] - employeeShare;
      expect(employerShare).to.equal(employeeShare + 1n);

      const employeeBefore = await ethers.provider.getBalance(employee.address);
      const employerBefore = await ethers.provider.getBalance(employer.address);

      const splitTx = await escrow
        .connect(employer)
        .splitAfterArbiterTimeout(agreementId, 0n);
      const splitReceipt = await splitTx.wait();
      const gasPaid = splitReceipt!.gasUsed * splitReceipt!.gasPrice;

      await expect(splitTx)
        .to.emit(escrow, "Resolved")
        .withArgs(agreementId, 0n, employeeShare, employerShare);

      // Employee did not send the tx, so their balance changes by the payout alone.
      expect(await ethers.provider.getBalance(employee.address)).to.equal(
        employeeBefore + employeeShare,
      );
      // Employer paid gas to call split, so subtract gas from the expected total.
      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore + employerShare - gasPaid,
      );
      expect((await escrow.getMilestone(agreementId, 0n)).status).to.equal(
        Resolved,
      );

      await expect(
        escrow.connect(employee).splitAfterArbiterTimeout(agreementId, 0n),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Resolved, Disputed);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);
      const disputedAt0 = await escrow.disputedAt(0n, 0n);
      await networkHelpers.time.increaseTo(
        disputedAt0 + BigInt(ARBITER_TIMEOUT) + 1n,
      );

      const employeeShare0 = amounts[0] / 2n;
      const employerShare0 = amounts[0] - employeeShare0;
      await expect(
        escrow.connect(employee).splitAfterArbiterTimeout(0n, 0n),
      )
        .to.emit(escrow, "Resolved")
        .withArgs(0n, 0n, employeeShare0, employerShare0);

      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        (await unpaidMilestoneSum(escrow, 0n)) +
          (await unpaidMilestoneSum(escrow, agreementId)),
      );
    });

    it("after resolve, approve, submitWork and claimAfterTimeout all revert", async function () {
      const {
        escrow,
        employer,
        employee,
        arbiter,
        amounts,
        proofHash,
        maxRejections,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await rejectUntilDisputed(escrow, employee, proofHash, maxRejections);
      await escrow.connect(arbiter).resolve(0n, 0n, amounts[0] / 2n);

      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Resolved, Submitted);

      await expect(
        escrow.connect(employee).submitWork(0n, 0n, ethers.id("ipfs://again")),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Resolved, Funded);

      await expect(escrow.claimAfterTimeout(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Resolved, Submitted);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        await unpaidMilestoneSum(escrow, 0n),
      );
    });
  });

  describe("reclaimExpired and cancelMilestone", function () {
    it("reclaimExpired before the deadline reverts, and after it refunds once", async function () {
      const { escrow, employer, amounts, total, deadlines } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await expect(escrow.reclaimExpired(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "NotExpired")
        .withArgs(deadlines[0]);

      await networkHelpers.time.increaseTo(deadlines[0] + 1n);

      const employerBefore = await ethers.provider.getBalance(employer.address);
      const reclaimTx = await escrow.reclaimExpired(0n, 0n);
      const reclaimReceipt = await reclaimTx.wait();
      const gasPaid = reclaimReceipt!.gasUsed * reclaimReceipt!.gasPrice;

      await expect(reclaimTx)
        .to.emit(escrow, "Expired")
        .withArgs(0n, 0n, employer.address, amounts[0]);

      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore + amounts[0] - gasPaid,
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Expired);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);

      await expect(escrow.reclaimExpired(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Expired, Funded);
    });

    it("allows only the employer to reclaim or cancel", async function () {
      const { escrow, employee, arbiter, other, deadlines } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await networkHelpers.time.increaseTo(deadlines[0] + 1n);

      await expect(
        escrow.connect(employee).reclaimExpired(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(arbiter).reclaimExpired(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(other).reclaimExpired(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");

      // Milestone 1 is still Funded — cancel access control only.
      await expect(
        escrow.connect(employee).cancelMilestone(0n, 1n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(arbiter).cancelMilestone(0n, 1n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
      await expect(
        escrow.connect(other).cancelMilestone(0n, 1n),
      ).to.be.revertedWithCustomError(escrow, "NotEmployer");
    });

    it("reclaimExpired on a Submitted milestone reverts", async function () {
      const { escrow, employee, proofHash, deadlines } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await networkHelpers.time.increaseTo(deadlines[0] + 1n);

      await expect(escrow.reclaimExpired(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Submitted, Funded);
    });

    it("cancelMilestone on a Funded milestone refunds exactly the amount", async function () {
      const { escrow, employer, amounts, total } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      const employerBefore = await ethers.provider.getBalance(employer.address);
      const cancelTx = await escrow.cancelMilestone(0n, 0n);
      const cancelReceipt = await cancelTx.wait();
      const gasPaid = cancelReceipt!.gasUsed * cancelReceipt!.gasPrice;

      await expect(cancelTx)
        .to.emit(escrow, "MilestoneCancelled")
        .withArgs(0n, 0n, employer.address, amounts[0]);

      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore + amounts[0] - gasPaid,
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Cancelled);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);
    });

    it("cancelMilestone on Submitted, Rejected, Disputed or Approved reverts", async function () {
      const { escrow, employer, employee, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await expect(escrow.cancelMilestone(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "NotCancellable")
        .withArgs(Submitted);

      await escrow.reject(0n, 0n, ethers.id("needs-revision"));
      await expect(escrow.cancelMilestone(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "NotCancellable")
        .withArgs(Rejected);

      await escrow
        .connect(employee)
        .submitWork(0n, 0n, ethers.id("ipfs://v2"));
      await escrow.reject(0n, 0n, ethers.id("second-reject"));
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Disputed);
      await expect(escrow.cancelMilestone(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "NotCancellable")
        .withArgs(Disputed);

      await escrow
        .connect(employee)
        .submitWork(0n, 1n, ethers.id("ipfs://frontend"));
      await escrow.connect(employer).approve(0n, 1n);
      expect((await escrow.getMilestone(0n, 1n)).status).to.equal(Approved);
      await expect(escrow.cancelMilestone(0n, 1n))
        .to.be.revertedWithCustomError(escrow, "NotCancellable")
        .withArgs(Approved);
    });

    it("after Expired or Cancelled, submitWork, approve and claimAfterTimeout revert", async function () {
      const {
        escrow,
        employer,
        employee,
        amounts,
        total,
        proofHash,
        deadlines,
      } = await networkHelpers.loadFixture(fundedAgreementFixture);

      await networkHelpers.time.increaseTo(deadlines[0] + 1n);
      await escrow.reclaimExpired(0n, 0n);
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Expired);

      await expect(
        escrow.connect(employee).submitWork(0n, 0n, proofHash),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Expired, Funded);
      await expect(escrow.connect(employer).approve(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Expired, Submitted);
      await expect(escrow.claimAfterTimeout(0n, 0n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Expired, Submitted);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        await unpaidMilestoneSum(escrow, 0n),
      );

      await escrow.cancelMilestone(0n, 1n);
      expect((await escrow.getMilestone(0n, 1n)).status).to.equal(Cancelled);

      await expect(
        escrow
          .connect(employee)
          .submitWork(0n, 1n, ethers.id("ipfs://frontend")),
      )
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Cancelled, Funded);
      await expect(escrow.connect(employer).approve(0n, 1n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Cancelled, Submitted);
      await expect(escrow.claimAfterTimeout(0n, 1n))
        .to.be.revertedWithCustomError(escrow, "WrongStatus")
        .withArgs(Cancelled, Submitted);

      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        0n,
      );
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(0n);
      expect(amounts[0] + amounts[1]).to.equal(total);
    });

    it("reclaimExpired after a rejection past the resubmit deadline refunds the employer", async function () {
      const { escrow, employer, employee, amounts, total, proofHash } =
        await networkHelpers.loadFixture(fundedAgreementFixture);

      await escrow.connect(employee).submitWork(0n, 0n, proofHash);
      await escrow.reject(0n, 0n, ethers.id("needs-revision"));
      const rejected = await escrow.getMilestone(0n, 0n);
      expect(rejected.status).to.equal(Rejected);

      await networkHelpers.time.increaseTo(rejected.workDeadline + 1n);

      const employerBefore = await ethers.provider.getBalance(employer.address);
      const reclaimTx = await escrow.reclaimExpired(0n, 0n);
      const reclaimReceipt = await reclaimTx.wait();
      const gasPaid = reclaimReceipt!.gasUsed * reclaimReceipt!.gasPrice;

      await expect(reclaimTx)
        .to.emit(escrow, "Expired")
        .withArgs(0n, 0n, employer.address, amounts[0]);

      expect(await ethers.provider.getBalance(employer.address)).to.equal(
        employerBefore + amounts[0] - gasPaid,
      );
      expect((await escrow.getMilestone(0n, 0n)).status).to.equal(Expired);
      expect(await unpaidMilestoneSum(escrow, 0n)).to.equal(total - amounts[0]);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        total - amounts[0],
      );
    });
  });
});


