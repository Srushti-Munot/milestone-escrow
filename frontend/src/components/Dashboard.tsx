import { useQuery } from '@tanstack/react-query'
import { formatEther, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { escrowAbi, escrowAddress } from '../lib/contract'
import { shortAddress } from '../lib/status'
import { MilestoneActions } from './MilestoneActions'
import { StatusChip } from './StatusChip'

type AgreementView = {
  id: number
  employer: Address
  employee: Address
  arbiter: Address
  reviewWindow: bigint
  maxRejections: number
  totalDeposited: bigint
  cancelled: boolean
  milestones: Array<{
    index: number
    description: string
    amount: bigint
    workDeadline: bigint
    submittedAt: bigint
    status: number
    rejectionCount: number
    disputedAt: bigint
  }>
}

type DashboardProps = {
  refreshKey: number
  onActionSuccess: () => void
}

export function Dashboard({ refreshKey, onActionSuccess }: DashboardProps) {
  const publicClient = usePublicClient()

  const {
    data: agreements,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['escrow-agreements', escrowAddress, refreshKey],
    enabled: !!publicClient,
    queryFn: async (): Promise<AgreementView[]> => {
      if (!publicClient) return []

      const count = await publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'agreementCount',
      })

      const total = Number(count as bigint)
      const rows: AgreementView[] = []

      for (let id = 0; id < total; id++) {
        const agreement = (await publicClient.readContract({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: 'getAgreement',
          args: [BigInt(id)],
        })) as {
          employer: Address
          employee: Address
          arbiter: Address
          reviewWindow: bigint
          maxRejections: number
          totalDeposited: bigint
          cancelled: boolean
        }

        const mCount = Number(
          (await publicClient.readContract({
            address: escrowAddress,
            abi: escrowAbi,
            functionName: 'milestoneCount',
            args: [BigInt(id)],
          })) as bigint,
        )

        const milestones = []
        for (let index = 0; index < mCount; index++) {
          const milestone = (await publicClient.readContract({
            address: escrowAddress,
            abi: escrowAbi,
            functionName: 'getMilestone',
            args: [BigInt(id), BigInt(index)],
          })) as {
            description: string
            amount: bigint
            workDeadline: bigint
            submittedAt: bigint
            rejectionCount: number
            status: number
          }

          const disputedAt = (await publicClient.readContract({
            address: escrowAddress,
            abi: escrowAbi,
            functionName: 'disputedAt',
            args: [BigInt(id), BigInt(index)],
          })) as bigint

          milestones.push({
            index,
            description: milestone.description,
            amount: milestone.amount,
            workDeadline: milestone.workDeadline,
            submittedAt: milestone.submittedAt,
            status: Number(milestone.status),
            rejectionCount: Number(milestone.rejectionCount),
            disputedAt,
          })
        }

        rows.push({
          id,
          employer: agreement.employer,
          employee: agreement.employee,
          arbiter: agreement.arbiter,
          reviewWindow: agreement.reviewWindow,
          maxRejections: Number(agreement.maxRejections),
          totalDeposited: agreement.totalDeposited,
          cancelled: agreement.cancelled,
          milestones,
        })
      }

      return rows.reverse()
    },
  })

  return (
    <section className="panel">
      <div className="panel-head row">
        <div>
          <h2>Dashboard</h2>
          <p>
            Agreements and milestones from the deployed escrow. Actions appear
            only for your role and the current milestone status.
          </p>
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading ? <p className="muted">Loading agreements…</p> : null}
      {isError ? (
        <p className="inline-error">
          {error instanceof Error ? error.message : 'Failed to load agreements.'}
        </p>
      ) : null}

      {!isLoading && !isError && (agreements?.length ?? 0) === 0 ? (
        <p className="muted">No agreements yet. Fund one with the form above.</p>
      ) : null}

      <div className="agreement-list">
        {agreements?.map((agreement) => (
          <article key={agreement.id} className="agreement-card">
            <header className="agreement-card-head">
              <h3>Agreement #{agreement.id}</h3>
              <p>
                Deposit {formatEther(agreement.totalDeposited)} MON
                {agreement.cancelled ? ' · cancelled' : ''}
              </p>
            </header>

            <dl className="party-grid">
              <div>
                <dt>Employer</dt>
                <dd>{shortAddress(agreement.employer)}</dd>
              </div>
              <div>
                <dt>Employee</dt>
                <dd>{shortAddress(agreement.employee)}</dd>
              </div>
              <div>
                <dt>Arbiter</dt>
                <dd>{shortAddress(agreement.arbiter)}</dd>
              </div>
              <div>
                <dt>Review / max rejects</dt>
                <dd>
                  {agreement.reviewWindow.toString()}s · {agreement.maxRejections}
                </dd>
              </div>
            </dl>

            <ul className="milestone-list">
              {agreement.milestones.map((milestone) => (
                <li key={milestone.index}>
                  <div className="milestone-main">
                    <span className="milestone-title">
                      #{milestone.index} {milestone.description}
                    </span>
                    <StatusChip status={milestone.status} />
                  </div>
                  <div className="milestone-meta">
                    <span>{formatEther(milestone.amount)} MON</span>
                    <span>
                      Deadline{' '}
                      {new Date(
                        Number(milestone.workDeadline) * 1000,
                      ).toLocaleString()}
                    </span>
                    <span>Rejects {milestone.rejectionCount}</span>
                  </div>

                  {!agreement.cancelled ? (
                    <MilestoneActions
                      milestone={{
                        agreementId: agreement.id,
                        milestoneId: milestone.index,
                        description: milestone.description,
                        amount: milestone.amount,
                        workDeadline: milestone.workDeadline,
                        submittedAt: milestone.submittedAt,
                        status: milestone.status,
                        rejectionCount: milestone.rejectionCount,
                        disputedAt: milestone.disputedAt,
                        reviewWindow: agreement.reviewWindow,
                        employer: agreement.employer,
                        employee: agreement.employee,
                        arbiter: agreement.arbiter,
                      }}
                      onSuccess={onActionSuccess}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
