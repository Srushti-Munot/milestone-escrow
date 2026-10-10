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

  async function unpaidMilestoneSum(
    escrow: Awaited<ReturnType<typeof ethers.deployContract>>,
    agreementId: bigint,
  ) {
    const count = await escrow.milestoneCount(agreementId);
    let sum = 0n;
    for (let i = 0n; i < count; i++) {
      const milestone = await escrow.getMilestone(agreementId, i);
      const status = Number(milestone.status);
      if (status !== Approved && status !== AutoReleased) {
        sum += milestone.amount;
      }
    }
    return sum;
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
});


