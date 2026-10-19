import express from 'express'
import mongoose from 'mongoose'
import Complaint from '../models/Complaint.js'
import User from '../models/User.js'
import { authenticate, authorize } from '../middleware/authMiddleware.js'
import { notifyComplaint } from '../services/emailService.js'

const router = express.Router()
const departments = ['Finance Support', 'Technical Support', 'Delivery/Logistics', 'Product Support', 'Account Support', 'Customer Support', 'Security Team']
const priorities = ['Critical', 'High', 'Medium', 'Low']
const statuses = ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed']
const categoryLabels = ['Payment Issue', 'Technical Issue', 'Delivery Issue', 'Product Issue', 'Account Issue', 'Refund Issue', 'Other']
router.use(authenticate, authorize('Admin'))

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sameDepartment = (left, right) => left?.trim().toLowerCase() === right?.trim().toLowerCase()

async function getAnalytics() {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCMonth(start.getUTCMonth() - 11)

  const [rawCategories, rawPriorities, rawDepartments, rawStatuses, rawMonthly] = await Promise.all([
    Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
    Complaint.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Complaint.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
    Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Complaint.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ])

  const categoryAliases = { 'Account/Login Issue': 'Account Issue', 'General Complaint': 'Other', Other: 'Other' }
  const categories = new Map()
  for (const item of rawCategories) {
    const label = categoryAliases[item._id] || item._id || 'Other'
    categories.set(label, (categories.get(label) || 0) + item.count)
  }
  const zeroFill = (labels, raw) => {
    const counts = new Map(raw.map(({ _id, count }) => [_id, count]))
    return labels.map((name) => ({ name, count: counts.get(name) || 0 }))
  }
  const monthlyCounts = new Map(rawMonthly.map(({ _id, count }) => [_id, count]))
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(start)
    date.setUTCMonth(start.getUTCMonth() + i)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return { name: new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date), count: monthlyCounts.get(key) || 0 }
  })
  return {
    byCategory: categoryLabels.map((name) => ({ name, count: categories.get(name) || 0 })),
    byPriority: zeroFill(priorities, rawPriorities),
    byDepartment: zeroFill(departments, rawDepartments),
    byStatus: zeroFill(statuses, rawStatuses),
    monthly,
  }
}

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [summary, resolvedCases, recentComplaints, analytics] = await Promise.all([
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.find({ status: { $in: ['Resolved', 'Closed'] } }).select('createdAt updatedAt statusHistory').lean(),
      Complaint.find().sort({ createdAt: -1 }).limit(10)
        .populate('userId', 'name email').populate('assignedTo', 'name email department').lean(),
      getAnalytics(),
    ])
    const counts = Object.fromEntries(summary.map(({ _id, count }) => [_id, count]))
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const resolved = (counts.Resolved || 0) + (counts.Closed || 0)
    const pending = (counts.Submitted || 0) + (counts['AI Analyzed'] || 0) + (counts.Assigned || 0)
    const durations = resolvedCases.map((complaint) => {
      const resolvedAt = complaint.statusHistory?.findLast((entry) => entry.status === 'Resolved')?.changedAt || complaint.updatedAt
      return resolvedAt ? new Date(resolvedAt).getTime() - new Date(complaint.createdAt).getTime() : null
    }).filter((duration) => Number.isFinite(duration) && duration >= 0)
    const averageResolutionMs = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null
    return res.json({ summary: { total, resolved, pending, inProgress: counts['In Progress'] || 0, averageResolutionMs }, analytics, recentComplaints })
  } catch (error) { next(error) }
})

router.get('/complaints', async (req, res, next) => {
  try {
    const query = {}
    for (const key of ['category', 'priority', 'department', 'status']) if (req.query[key]) query[key] = req.query[key]
    if (req.query.search?.trim()) {
      const search = new RegExp(escapeRegex(req.query.search.trim()), 'i')
      query.$or = [{ ticketId: search }, { subject: search }]
    }
    const complaints = await Complaint.find(query).sort({ createdAt: -1 })
      .populate('userId', 'name email').populate('assignedTo', 'name email department').lean()
    return res.json({ complaints })
  } catch (error) { next(error) }
})

router.get('/users', async (req, res, next) => {
  try {
    const query = {}
    if (req.query.role && ['Customer', 'Support Staff', 'Admin'].includes(req.query.role)) query.role = req.query.role
    const users = await User.find(query).select('name email role department createdAt').sort({ createdAt: -1 }).lean()
    return res.json({ users })
  } catch (error) { next(error) }
})

router.get('/departments', async (_req, res, next) => {
  try {
    const [staffCounts, complaintCounts] = await Promise.all([
      User.aggregate([{ $match: { role: 'Support Staff' } }, { $group: { _id: '$department', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
    ])
    const staffByDepartment = new Map(staffCounts.map(({ _id, count }) => [_id, count]))
    const complaintsByDepartment = new Map(complaintCounts.map(({ _id, count }) => [_id, count]))
    return res.json({ departments: departments.map((name) => ({ name, staffCount: staffByDepartment.get(name) || 0, complaintCount: complaintsByDepartment.get(name) || 0 })) })
  } catch (error) { next(error) }
})

router.patch('/complaints/:ticketId/assignment', async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId })
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' })
    const staffId = req.body.staffId || null
    if (!staffId) {
      complaint.assignedTo = null
      await complaint.save()
      return res.json({ message: 'Complaint moved to the department queue.', complaint })
    }
    if (!mongoose.Types.ObjectId.isValid(staffId)) return res.status(400).json({ message: 'Choose a valid staff account.' })
    const staff = await User.findOne({ _id: staffId, role: 'Support Staff' }).select('department email')
    if (!staff) return res.status(400).json({ message: 'The selected user is not support staff.' })
    if (!sameDepartment(staff.department, complaint.department)) return res.status(400).json({ message: 'Staff can only be assigned complaints from their department.' })
    const assignmentChanged = complaint.assignedTo?.toString() !== staff._id.toString()
    complaint.assignedTo = staff._id
    const assignedAt = new Date()
    if (['Submitted', 'AI Analyzed'].includes(complaint.status)) {
      complaint.status = 'Assigned'
      complaint.statusHistory.push({ status: 'Assigned', changedAt: assignedAt })
    }
    await complaint.save()
    if (assignmentChanged) void notifyComplaint(staff.email, 'Complaint assigned', complaint, `assigned:${complaint._id}:${staff._id}:${assignedAt.toISOString()}`)
    try {
      const customer = await User.findOne({ _id: complaint.userId, role: 'Customer' }).select('email').lean()
      if (customer && assignmentChanged) void notifyComplaint(customer.email, 'Complaint assigned', complaint, `assigned:${complaint._id}:${staff._id}:${assignedAt.toISOString()}`)
    } catch (emailLookupError) {
      console.error(`[Email] Could not look up customer for ${complaint.ticketId}: ${emailLookupError.message}`)
    }
    return res.json({ message: 'Complaint assigned successfully.', complaint })
  } catch (error) { next(error) }
})

router.patch('/complaints/:ticketId/status', async (req, res, next) => {
  try {
    const status = req.body.status
    if (!statuses.includes(status)) return res.status(400).json({ message: 'Choose a valid complaint status.' })
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId })
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' })
    if (complaint.status !== status) {
      const changedAt = new Date()
      complaint.status = status
      complaint.statusHistory.push({ status, changedAt })
      await complaint.save()
      try {
        const customer = await User.findOne({ _id: complaint.userId, role: 'Customer' }).select('email').lean()
        if (customer) void notifyComplaint(customer.email, status === 'Resolved' ? 'Complaint resolved' : 'Complaint status updated', complaint, `status:${complaint._id}:${status}:${changedAt.toISOString()}`)
      } catch (emailLookupError) {
        console.error(`[Email] Could not look up customer for ${complaint.ticketId}: ${emailLookupError.message}`)
      }
    }
    return res.json({ message: 'Complaint status updated.', complaint })
  } catch (error) { next(error) }
})

export default router
