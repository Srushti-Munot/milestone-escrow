import { milestoneStatusLabel } from '../lib/status'

type StatusChipProps = {
  status: number
}

export function StatusChip({ status }: StatusChipProps) {
  const label = milestoneStatusLabel(status)
  return (
    <span className={`status-chip status-${label.toLowerCase()}`}>{label}</span>
  )
}
