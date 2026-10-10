import { useMemo, useState, type ChangeEvent } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useAccount, useBlock } from 'wagmi'
import { escrowAbi, escrowAddress } from '../lib/contract'
import { sha256File, sha256Hex } from '../lib/hash'
import { useContractAction } from '../hooks/useContractAction'
import { TxBanner } from './TxBanner'

const Funded = 0
const Submitted = 1
const Rejected = 2
const Disputed = 3

/** Matches MilestoneEscrow.ARBITER_TIMEOUT (3 days). */
const ARBITER_TIMEOUT_SEC = 3 * 24 * 60 * 60

export type MilestoneActionData = {
  agreementId: number
  milestoneId: number
  description: string
  amount: bigint
  workDeadline: bigint
  submittedAt: bigint
  status: number
  rejectionCount: number
  disputedAt: bigint
  reviewWindow: bigint
  employer: Address
  employee: Address
  arbiter: Address
}

type MilestoneActionsProps = {
  milestone: MilestoneActionData
  onSuccess: () => void
}

function sameAddress(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

export function MilestoneActions({ milestone, onSuccess }: MilestoneActionsProps) {
  const { address } = useAccount()
  const { data: block } = useBlock({ watch: true })
  const now = block?.timestamp ?? BigInt(Math.floor(Date.now() / 1000))

  const isEmployer = sameAddress(address, milestone.employer)
  const isEmployee = sameAddress(address, milestone.employee)
  const isArbiter = sameAddress(address, milestone.arbiter)
  const isParty = isEmployer || isEmployee

  const [proofHash, setProofHash] = useState<`0x${string}` | ''>('')
  const [proofFileName, setProofFileName] = useState('')
  const [hashError, setHashError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [employeeShareMon, setEmployeeShareMon] = useState('')

  const action = useContractAction({ onSuccess })

  const reviewEndsAt = milestone.submittedAt + milestone.reviewWindow
  const reviewWindowClosed =
    milestone.status === Submitted &&
    milestone.submittedAt > 0n &&
    now > reviewEndsAt

  const arbiterTimeoutAt =
    milestone.disputedAt > 0n
      ? milestone.disputedAt + BigInt(ARBITER_TIMEOUT_SEC)
      : 0n
  const arbiterTimedOut =
    milestone.status === Disputed &&
    arbiterTimeoutAt > 0n &&
    now > arbiterTimeoutAt

  const canSubmit =
    isEmployee &&
    (milestone.status === Funded || milestone.status === Rejected) &&
    now <= milestone.workDeadline

  const canRaiseDispute =
    isEmployee &&
    milestone.status === Rejected &&
    now <= milestone.workDeadline

  const canApprove = isEmployer && milestone.status === Submitted
  const canReject =
    isEmployer && milestone.status === Submitted && !reviewWindowClosed
  const canClaim = milestone.status === Submitted && reviewWindowClosed
  const canResolve = isArbiter && milestone.status === Disputed
  // Contract: only employer or employee (NotParty otherwise).
  const canSplitTimeout = isParty && arbiterTimedOut

  const hasAnyAction =
    canSubmit ||
    canRaiseDispute ||
    canApprove ||
    canReject ||
    canClaim ||
    canResolve ||
    canSplitTimeout

  const resolvePreview = useMemo(() => {
    if (!employeeShareMon) return null
    try {
      const employeeAmount = parseEther(employeeShareMon as `${number}`)
      if (employeeAmount > milestone.amount) return null
      return {
        employeeAmount,
        employerAmount: milestone.amount - employeeAmount,
      }
    } catch {
      return null
    }
  }, [employeeShareMon, milestone.amount])

  async function onProofFile(event: ChangeEvent<HTMLInputElement>) {
    setHashError(null)
    const file = event.target.files?.[0]
    if (!file) {
      setProofHash('')
      setProofFileName('')
      return
    }
    try {
      const hash = await sha256File(file)
      setProofHash(hash)
      setProofFileName(file.name)
    } catch (err) {
      setProofHash('')
      setProofFileName('')
      setHashError(err instanceof Error ? err.message : 'Could not hash file.')
    }
  }

  function run(
    functionName: string,
    args: readonly unknown[],
  ) {
    action.reset()
    action.writeContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName,
      args: args as never,
    })
  }

  async function onReject() {
    action.reset()
    setHashError(null)
    const trimmed = reason.trim()
    if (!trimmed) {
      setHashError('Enter a rejection reason to hash.')
      return
    }
    try {
      const reasonHash = await sha256Hex(trimmed)
      run('reject', [
        BigInt(milestone.agreementId),
        BigInt(milestone.milestoneId),
        reasonHash,
      ])
    } catch (err) {
      setHashError(err instanceof Error ? err.message : 'Could not hash reason.')
    }
  }

  function onResolve() {
    action.reset()
    setHashError(null)
    if (!resolvePreview) {
      setHashError('Enter a valid employee amount in MON (≤ milestone amount).')
      return
    }
    run('resolve', [
      BigInt(milestone.agreementId),
      BigInt(milestone.milestoneId),
      resolvePreview.employeeAmount,
    ])
  }

  if (!address || !hasAnyAction) {
    return null
  }

  const bannerMessage =
    hashError ??
    (action.phase === 'success'
      ? 'Action confirmed on Monad Testnet.'
      : action.message)

  const bannerPhase = hashError ? 'error' : action.phase

  return (
    <div className="milestone-actions">
      <TxBanner
        phase={bannerPhase}
        message={bannerMessage}
        hash={action.hash}
      />

      {canSubmit ? (
        <div className="action-block">
          <h4>Submit proof</h4>
          <p className="muted">
            Pick a file. It is hashed in your browser with SHA-256; only the hash
            is sent onchain.
          </p>
          <input type="file" onChange={onProofFile} />
          {proofFileName ? (
            <p className="hash-line">
              File <strong>{proofFileName}</strong>
            </p>
          ) : null}
          {proofHash ? (
            <p className="hash-line mono">
              Hash <code>{proofHash}</code>
            </p>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={action.isBusy || !proofHash}
            onClick={() =>
              run('submitWork', [
                BigInt(milestone.agreementId),
                BigInt(milestone.milestoneId),
                proofHash,
              ])
            }
          >
            Submit work
          </button>
        </div>
      ) : null}

      {canRaiseDispute ? (
        <div className="action-block">
          <h4>Raise dispute</h4>
          <p className="muted">Escalate this rejection to the arbiter.</p>
          <button
            type="button"
            className="btn warn"
            disabled={action.isBusy}
            onClick={() =>
              run('raiseDispute', [
                BigInt(milestone.agreementId),
                BigInt(milestone.milestoneId),
              ])
            }
          >
            Raise dispute
          </button>
        </div>
      ) : null}

      {canApprove || canReject ? (
        <div className="action-block">
          <h4>Employer review</h4>
          {canApprove ? (
            <button
              type="button"
              className="btn primary"
              disabled={action.isBusy}
              onClick={() =>
                run('approve', [
                  BigInt(milestone.agreementId),
                  BigInt(milestone.milestoneId),
                ])
              }
            >
              Approve &amp; pay {formatEther(milestone.amount)} MON
            </button>
          ) : null}
          {canReject ? (
            <>
              <label>
                Rejection reason (hashed in browser)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="What needs to change?"
                />
              </label>
              <button
                type="button"
                className="btn ghost danger"
                disabled={action.isBusy || !reason.trim()}
                onClick={() => void onReject()}
              >
                Reject
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {canClaim ? (
        <div className="action-block">
          <h4>Claim after timeout</h4>
          <p className="muted">
            Review window closed. Anyone can release this milestone to the
            employee.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={action.isBusy}
            onClick={() =>
              run('claimAfterTimeout', [
                BigInt(milestone.agreementId),
                BigInt(milestone.milestoneId),
              ])
            }
          >
            Claim for employee
          </button>
        </div>
      ) : null}

      {canResolve ? (
        <div className="action-block">
          <h4>Arbiter resolve</h4>
          <p className="muted">
            Choose how much of {formatEther(milestone.amount)} MON goes to the
            employee. The rest returns to the employer.
          </p>
          <label>
            Employee amount (MON)
            <input
              type="text"
              inputMode="decimal"
              value={employeeShareMon}
              onChange={(e) => setEmployeeShareMon(e.target.value)}
              placeholder="0.5"
            />
          </label>
          {resolvePreview ? (
            <p className="muted">
              Employee {formatEther(resolvePreview.employeeAmount)} · Employer{' '}
              {formatEther(resolvePreview.employerAmount)}
            </p>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={action.isBusy || !resolvePreview}
            onClick={onResolve}
          >
            Resolve split
          </button>
        </div>
      ) : null}

      {canSplitTimeout ? (
        <div className="action-block">
          <h4>50/50 after arbiter timeout</h4>
          <p className="muted">
            Arbiter did not act within 3 days. Employer or employee can force a
            split (odd wei remainder goes to the employer).
          </p>
          <button
            type="button"
            className="btn warn"
            disabled={action.isBusy}
            onClick={() =>
              run('splitAfterArbiterTimeout', [
                BigInt(milestone.agreementId),
                BigInt(milestone.milestoneId),
              ])
            }
          >
            Split 50/50
          </button>
        </div>
      ) : null}
    </div>
  )
}
