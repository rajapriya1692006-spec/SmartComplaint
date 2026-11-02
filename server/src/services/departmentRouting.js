import Complaint from '../models/Complaint.js'
import User from '../models/User.js'

export function normalizeDepartment(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

export function departmentScope(department) {
  const normalized = typeof department === 'string' ? department.trim().replace(/\s+/g, ' ') : ''
  if (!normalized) return { _id: null }
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return { department: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' } }
}

export async function chooseStaffForDepartment(department, { UserModel = User, ComplaintModel = Complaint } = {}) {
  const scope = departmentScope(department)
  if (!scope.department) {
    console.warn('[Routing] Cannot assign a complaint without a department; it remains in the department queue.')
    return null
  }

  try {
    const staff = await UserModel.find({ role: 'Support Staff', ...scope }).select('_id').lean()
    if (!staff.length) {
      console.warn(`[Routing] No Support Staff account is configured for ${department}; the complaint will remain in that department queue.`)
      return null
    }
    const active = await ComplaintModel.aggregate([
      { $match: { assignedTo: { $in: staff.map(({ _id }) => _id) }, status: { $nin: ['Resolved', 'Closed'] } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ])
    const loads = new Map(active.map(({ _id, count }) => [_id.toString(), count]))
    return staff.sort((a, b) => (loads.get(a._id.toString()) || 0) - (loads.get(b._id.toString()) || 0))[0]._id
  } catch (error) {
    console.error(`[Routing] Staff lookup failed for ${department}; code=${error.code || 'UNKNOWN'} name=${error.name || 'Error'}`)
    return null
  }
}
