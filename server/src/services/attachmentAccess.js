const normalizeDepartment = (value) => value?.replace(/\s+/g, ' ').trim().toLowerCase()

export function complaintAttachmentLookup(identifier) {
  return /^[a-f\d]{24}$/i.test(identifier) ? { _id: identifier } : { ticketId: identifier }
}

export function canAccessComplaintAttachment(user, complaint) {
  if (user?.role === 'Admin') return true
  if (user?.role === 'Customer') return complaint.userId?.toString() === user._id?.toString()
  if (user?.role !== 'Support Staff') return false

  const isAssigned = complaint.assignedTo?.toString() === user._id?.toString()
  const userDepartment = normalizeDepartment(user.department)
  const complaintDepartment = normalizeDepartment(complaint.department)
  const sharesDepartment = Boolean(userDepartment && complaintDepartment && userDepartment === complaintDepartment)
  return isAssigned || sharesDepartment
}
