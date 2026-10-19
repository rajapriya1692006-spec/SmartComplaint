export const STATUS_FLOW = ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed']

export function buildStatusTimeline(complaint) {
  const recorded = new Map((complaint.statusHistory || []).map(({ status, changedAt }) => [status, changedAt]))
  const currentIndex = STATUS_FLOW.indexOf(complaint.status)
  if (currentIndex < 0) return []
  return STATUS_FLOW.slice(0, currentIndex + 1).map((status, index) => {
    let changedAt = recorded.get(status) || null
    let historicalTimeUnavailable = false
    if (!changedAt && status === 'Submitted') changedAt = complaint.createdAt || null
    else if (!changedAt && status === complaint.status) changedAt = complaint.updatedAt || null
    else if (!changedAt && index < currentIndex) historicalTimeUnavailable = true
    return { status, changedAt, historicalTimeUnavailable }
  })
}
