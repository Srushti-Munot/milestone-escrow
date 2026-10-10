# Milestone Escrow

**Lawyers enforce promises after they are broken. We lock the money before work starts.**

Built for Monad Blitz Pune V3. Testnet only, no real funds.

## Quick links

| | |
|---|---|
| GitHub repo | https://github.com/Srushti-Munot/milestone-escrow |
| Live app (public) | https://milestone-escrow-puce.vercel.app/ |
| Contract address | [`0x4bBA9044e302995C890211C0f0172CBfc2297B7c`](https://testnet.monadscan.com/address/0x4bBA9044e302995C890211C0f0172CBfc2297B7c) |
| Deployment | Monad Testnet (chain ID 10143) |
| Explorer | https://testnet.monadvision.com/address/0x4bBA9044e302995C890211C0f0172CBfc2297B7c |
| Contract source | `contracts/contracts/MilestoneEscrow.sol` (verified on Sourcify / MonadVision: **YES**) |

## The problem

Freelancers and remote contributors often get paid late or not at all by people they cannot easily sue. Employers, in turn, want to pay only for work that is actually delivered.

## The solution

1. The employer locks the **full payment** in a smart contract, split into **milestones**.
2. The employee submits **proof** for each milestone (only a hash of the file goes on-chain).
3. The employer **approves** or **rejects** within a deadline.
4. If the employer goes **silent**, the money is released to the employee automatically.
5. If they disagree, a pre-agreed **arbiter** splits the disputed milestone.

Nobody can skip payment, and nobody can take more than was locked.

## Try it in 2 minutes (no setup)

1. Open the [live app](https://milestone-escrow-puce.vercel.app/) (or run locally below) and connect on **Monad Testnet** (chain ID **10143**, RPC `https://testnet-rpc.monad.xyz`, symbol **MON**).
2. Get free test MON at https://faucet.monad.xyz.
3. Use **three different wallets**: Employer, Employee, Arbiter.
4. As **Employer**, create an agreement with 2–3 small milestones (for example `0.01` MON each) and a **60-second** review window. Click **Fund & create**, confirm in the wallet, and wait until the UI shows **Confirmed** (explorer link included).
5. As **Employee**, submit proof for milestone 1. As **Employer**, **Approve** it and open the payout on the explorer.
6. Optional: on another milestone, **Reject** (or stay silent), wait **60 seconds**, then click **Claim for employee** to show auto-release.
7. Optional: raise a **dispute**, then as **Arbiter** use **Resolve split**.

Every step above is a real on-chain transaction. Wait for the green **Confirmed** state before calling it done.

> **UI vs contract:** The app exposes create, submit, approve, reject, claim, raise dispute, resolve, and 50/50 after arbiter timeout. `reclaimExpired` and `cancelMilestone` exist on-chain and in tests, but are **not** in the frontend yet.

## Overall process

```
Employer creates + funds agreement
            |
      Milestone: Funded
            |
Employee submits proof hash  ---- deadline missed ----> Employer reclaims money (Expired)*
            |
      Milestone: Submitted
            |
   +--------+-------------------------+
   |        |                         |
Approve   Reject                  Employer silent
   |        |                         |
 PAID     Rejected                anyone calls claim
 (Approved) |                     -> employee PAID (AutoReleased)
            |
   Employee resubmits (one more review window)
   or raises a dispute, or hits the rejection cap
            |
      Milestone: Disputed
            |
   Arbiter splits the money (Resolved)
   Arbiter silent for 3 days -> 50/50 split (Resolved)
```

\* Expired reclaim and cancelling an unstarted (**Funded**) milestone are supported by the contract; use a direct contract call or Hardhat for those until the UI buttons land.

An unstarted milestone (still Funded) can be cancelled by the employer for a full refund (contract).

## Roles

| Role | Who | Power |
|---|---|---|
| Employer | Pays and funds the agreement | Approve, reject; reclaim expired / cancel unstarted *(contract)* |
| Employee | Does the work | Submit proof, raise a dispute |
| Arbiter | Neutral third wallet, named at creation | Resolve a disputed milestone only |
| Anyone | Any wallet | Trigger the auto-release after silence |

Employer, employee and arbiter must be three different wallets.

## Functions

| Function | Who | What it does |
|---|---|---|
| `createAgreement` | Employer | Creates the agreement and locks the total MON. Reverts if the amount does not match the milestones, addresses are invalid or duplicated, deadlines are in the past, or there are more than 10 milestones. |
| `submitWork` | Employee | Submits a proof hash before the deadline. Also used to resubmit after a rejection. |
| `approve` | Employer | Approves a submitted milestone and pays the employee right away. |
| `reject` | Employer | Sends it back with a reason hash. Only allowed inside the review window. At the rejection cap it becomes a dispute. |
| `claimAfterTimeout` | Anyone | After the review window passes in silence, pays the employee. |
| `raiseDispute` | Employee | Escalates a rejected milestone to the arbiter. Only during the resubmit window. |
| `resolve` | Arbiter | Splits a disputed milestone between employee and employer. Cannot exceed the milestone amount. |
| `splitAfterArbiterTimeout` | Employer or employee | If the arbiter does nothing for 3 days, splits the milestone 50/50. |
| `reclaimExpired` | Employer | If the employee missed the work deadline, refunds that milestone. *(contract; not in UI yet)* |
| `cancelMilestone` | Employer | Refunds a milestone that is still Funded. A submitted one can never be cancelled. *(contract; not in UI yet)* |

Read-only helpers: `agreementCount`, `getAgreement`, `milestoneCount`, `getMilestone`, `disputedAt`.

Events (the public audit trail): `AgreementCreated`, `WorkSubmitted`, `Approved`, `Rejected`, `AutoReleased`, `DisputeRaised`, `Resolved`, `Expired`, `MilestoneCancelled`.

## Milestone states

`Funded` → `Submitted` → `Approved` / `AutoReleased`  
`Submitted` → `Rejected` → `Submitted` again, or `Disputed` → `Resolved`  
Other ends: `Expired`, `Cancelled`. Final states can never be paid twice.

## Why blockchain, and why Monad

- The money sits in the contract, so there is nothing to chase after a broken promise.
- Rules are enforced by code, the same for everyone, in any country.
- On-chain timestamps decide deadlines, so nobody can fudge when something happened.
- Every action is a transaction, giving both sides a tamper-proof timeline.
- Monad is fast and cheap, so several small transactions per agreement are practical. It is EVM-compatible, so it is normal Solidity.

## Who it is for

- Freelancers working for foreign clients
- DAO contributors and small remote teams
- Anyone paid by a counterparty they cannot easily take to court

Possible business model (idea only, **not built**): a small fee on each released milestone, or a paid tier for teams that need many agreements and arbiter tooling.

## Security

- **Checks, effects, interactions:** status is updated before any MON is sent.
- **Reentrancy guard** on every function that sends MON, tested with a malicious contract.
- **Role checks** on every function, and a milestone can be paid only once.
- **No owner, no admin keys, no upgrades, no token.**
- The employer cannot reject after the review window (to dodge auto-release) or cancel after submission (to rug the employee).
- The arbiter can only touch the disputed milestone.
- 40 automated tests. The contract is not audited.

## Honest limits

- The contract **cannot judge whether work is good**. It only guarantees the money is there and decides who gets to say so: the employer first, then the arbiter.
- Worst-case loss for either side is capped at one milestone.
- The arbiter is a trust assumption. Both sides agree on it at creation.
- **Not built (future extensions):** extra-work requests and yield on idle funds. Nothing here is faked.
- Reclaim / cancel are on-chain but not yet exposed in the web UI.

## Run it yourself

You need Node 18+ and Git. No `.env` file or private key is needed to run the tests or the frontend.

```bash
git clone https://github.com/Srushti-Munot/milestone-escrow.git
cd milestone-escrow
```

**1. Run the contract tests** (local fake chain, no wallet needed). Expect 40 passing.

```bash
cd contracts
npm install
npx hardhat test
```

**2. Run the frontend** (reads the deployed contract from `/shared`).

```bash
cd ../frontend
npm install
npm run dev
```

Open the printed link (usually http://localhost:5173), connect a wallet on Monad Testnet, and follow [Try it in 2 minutes](#try-it-in-2-minutes-no-setup) above.

On Windows PowerShell, use `npx.cmd` and `npm.cmd` if scripts are blocked.

**Optional: deploy your own copy** to Monad Testnet. Store a throwaway key in Hardhat's keystore (never commit a key), fund its address from the faucet, then:

```bash
cd contracts
npx hardhat keystore set MONAD_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/MilestoneEscrow.ts --network monadTestnet
```

## Project layout

```
contracts/   Solidity contract, tests, deploy module (Hardhat 3)
frontend/    React + Vite + wagmi + viem app
shared/      abi.json and address.json
```

