export const MILESTONE_STATUS = [
  'Funded',
  'Submitted',
  'Rejected',
  'Disputed',
  'Approved',
  'AutoReleased',
  'Resolved',
  'Expired',
  'Cancelled',
] as const

export type MilestoneStatusLabel = (typeof MILESTONE_STATUS)[number]

export function milestoneStatusLabel(status: number): MilestoneStatusLabel {
  return MILESTONE_STATUS[status] ?? 'Funded'
}

export function shortAddress(value: string): string {
  if (value.length < 10) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
