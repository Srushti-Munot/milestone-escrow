import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { isAddress, parseEther } from 'viem'
import { escrowAbi, escrowAddress } from '../lib/contract'
import { TxBanner } from './TxBanner'

type MilestoneRow = {
  id: string
  description: string
  amountMon: string
  deadlineLocal: string
}

type CreateAgreementFormProps = {
  onCreated: () => void
}

function emptyRow(): MilestoneRow {
  return {
    id: crypto.randomUUID(),
    description: '',
    amountMon: '',
    deadlineLocal: '',
  }
}

function localDatetimeToUnix(value: string): bigint {
  const ms = new Date(value).getTime()
  if (Number.isNaN(ms)) {
    throw new Error('Invalid deadline')
  }
  return BigInt(Math.floor(ms / 1000))
}

export function CreateAgreementForm({ onCreated }: CreateAgreementFormProps) {
  const [employee, setEmployee] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [reviewWindow, setReviewWindow] = useState('259200')
  const [maxRejections, setMaxRejections] = useState('2')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([emptyRow()])
  const [formError, setFormError] = useState<string | null>(null)

  const { writeContract, data: hash, error: writeError, isPending, reset } =
    useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
  })

  const totalMon = useMemo(() => {
    return milestones.reduce((sum, row) => {
      const n = Number(row.amountMon)
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [milestones])

  useEffect(() => {
    if (isSuccess) {
      onCreated()
    }
  }, [isSuccess, onCreated])

  const phase =
    writeError || receiptError || formError
      ? 'error'
      : isPending || isConfirming
        ? 'pending'
        : isSuccess
          ? 'success'
          : 'idle'

  const statusMessage =
    formError ??
    writeError?.message ??
    receiptError?.message ??
    (isPending
      ? 'Confirm the transaction in your wallet…'
      : isConfirming
        ? 'Waiting for the receipt to confirm on Monad Testnet…'
        : isSuccess
          ? 'Agreement funded and created. Deposit is locked in escrow.'
          : undefined)

  function updateRow(id: string, patch: Partial<MilestoneRow>) {
    setMilestones((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    reset()

    if (!isAddress(employee)) {
      setFormError('Employee must be a valid address.')
      return
    }
    if (!isAddress(arbiter)) {
      setFormError('Arbiter must be a valid address.')
      return
    }
    if (employee.toLowerCase() === arbiter.toLowerCase()) {
      setFormError('Employee and arbiter must be different.')
      return
    }

    const review = BigInt(reviewWindow || '0')
    const maxRej = Number(maxRejections)
    if (review <= 0n) {
      setFormError('Review window must be greater than 0 seconds.')
      return
    }
    if (!Number.isInteger(maxRej) || maxRej < 1 || maxRej > 255) {
      setFormError('Max rejections must be an integer from 1 to 255.')
      return
    }
    if (milestones.length === 0) {
      setFormError('Add at least one milestone.')
      return
    }

    try {
      const descriptions = milestones.map((m) => m.description.trim())
      if (descriptions.some((d) => d.length === 0)) {
        setFormError('Every milestone needs a description.')
        return
      }

      const amounts = milestones.map((m) => parseEther(m.amountMon as `${number}`))
      if (amounts.some((a) => a <= 0n)) {
        setFormError('Every milestone amount must be greater than 0 MON.')
        return
      }

      const deadlines = milestones.map((m) => localDatetimeToUnix(m.deadlineLocal))
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (deadlines.some((d) => d <= now)) {
        setFormError('Every deadline must be in the future.')
        return
      }

      const value = amounts.reduce((sum, a) => sum + a, 0n)

      writeContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'createAgreement',
        args: [
          employee as `0x${string}`,
          arbiter as `0x${string}`,
          review,
          maxRej,
          descriptions,
          amounts,
          deadlines,
        ],
        value,
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not build transaction.')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Create agreement</h2>
        <p>You are the employer. The full milestone budget is sent with the create call.</p>
      </div>

      <TxBanner phase={phase} message={statusMessage} hash={hash} />

      <form className="create-form" onSubmit={submit}>
        <label>
          Employee address
          <input
            value={employee}
            onChange={(e) => setEmployee(e.target.value.trim())}
            placeholder="0x…"
            autoComplete="off"
            required
          />
        </label>
        <label>
          Arbiter address
          <input
            value={arbiter}
            onChange={(e) => setArbiter(e.target.value.trim())}
            placeholder="0x…"
            autoComplete="off"
            required
          />
        </label>
        <div className="form-row">
          <label>
            Review window (seconds)
            <input
              type="number"
              min={1}
              value={reviewWindow}
              onChange={(e) => setReviewWindow(e.target.value)}
              required
            />
          </label>
          <label>
            Max rejections
            <input
              type="number"
              min={1}
              max={255}
              value={maxRejections}
              onChange={(e) => setMaxRejections(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="milestones-block">
          <div className="milestones-head">
            <h3>Milestones</h3>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setMilestones((rows) => [...rows, emptyRow()])}
            >
              Add milestone
            </button>
          </div>

          {milestones.map((row, index) => (
            <fieldset key={row.id} className="milestone-row">
              <legend>Milestone {index + 1}</legend>
              <label>
                Description
                <input
                  value={row.description}
                  onChange={(e) =>
                    updateRow(row.id, { description: e.target.value })
                  }
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Amount (MON)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amountMon}
                    onChange={(e) =>
                      updateRow(row.id, { amountMon: e.target.value })
                    }
                    placeholder="1.0"
                    required
                  />
                </label>
                <label>
                  Work deadline
                  <input
                    type="datetime-local"
                    value={row.deadlineLocal}
                    onChange={(e) =>
                      updateRow(row.id, { deadlineLocal: e.target.value })
                    }
                    required
                  />
                </label>
              </div>
              {milestones.length > 1 ? (
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() =>
                    setMilestones((rows) => rows.filter((r) => r.id !== row.id))
                  }
                >
                  Remove
                </button>
              ) : null}
            </fieldset>
          ))}
        </div>

        <div className="fund-row">
          <p>
            Total deposit:{' '}
            <strong>{totalMon.toLocaleString(undefined, { maximumFractionDigits: 6 })} MON</strong>
          </p>
          <button
            type="submit"
            className="btn primary"
            disabled={isPending || isConfirming}
          >
            {isPending || isConfirming ? 'Submitting…' : 'Fund & create'}
          </button>
        </div>
      </form>
    </section>
  )
}
