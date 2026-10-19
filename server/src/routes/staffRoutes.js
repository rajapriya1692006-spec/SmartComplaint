import express from 'express'
import Complaint from '../models/Complaint.js'
import Comment from '../models/Comment.js'
import { authenticate, authorize } from '../middleware/authMiddleware.js'
import { buildStatusTimeline } from '../services/statusTimeline.js'
import User from '../models/User.js'
import { notifyComplaint } from '../services/emailService.js'

const router = express.Router()
const staffOnly = [authenticate, authorize('Support Staff')]
const priorities = ['Critical', 'High', 'Medium', 'Low']
const statuses = ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed']
const nextStatus = {
  Submitted: 'Assigned',
  'AI Analyzed': 'Assigned',
  Assigned: 'In Progress',
  'In Progress': 'Resolved',
  Resolved: 'Closed',
}

function departmentQuery(user) {
  if (!user.department?.trim()) return { _id: null }
  // Match older records that may have been stored with different casing or padding.
  const departmentPattern = user.department.trim().replace(/\s+/g, '\\s+')
  return { department: { $regex: `^\\s*${departmentPattern}\\s*$`, $options: 'i' } }
}

router.get('/complaints', ...staffOnly, async (req, res, next) => {
  try {
    const departmentScope = departmentQuery(req.user)
    const query = { ...departmentScope }
    if (req.query.category) query.category = req.query.category
    if (req.query.priority) query.priority = req.query.priority
    if (req.query.status) query.status = req.query.status
    const [complaints, departmentComplaints] = await Promise.all([
      Complaint.find(query).populate('assignedTo', 'name email department').sort({ createdAt: -1 }).lean(),
      Complaint.find(departmentScope).select('priority status').lean(),
    ])
    complaints.sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || new Date(b.createdAt) - new Date(a.createdAt))
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Assigned: 0, Pending: 0, 'In Progress': 0, Resolved: 0 }
    for (const complaint of departmentComplaints) {
      if (counts[complaint.priority] !== undefined) counts[complaint.priority] += 1
      if (complaint.status === 'Assigned') counts.Assigned += 1
      if (['Submitted', 'AI Analyzed', 'Assigned'].includes(complaint.status)) counts.Pending += 1
      if (complaint.status === 'In Progress') counts['In Progress'] += 1
      if (complaint.status === 'Resolved') counts.Resolved += 1
    }
    return res.json({ department: req.user.department?.trim() || null, counts, total: complaints.length, complaints })
  } catch (error) { next(error) }
})

router.get('/complaints/:ticketId', ...staffOnly, async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId, ...departmentQuery(req.user) })
      .populate('assignedTo', 'name email department')
      .populate('comments.authorId', 'name')
      .lean()
    if (!complaint) return res.status(404).json({ message: 'Complaint not found in your department.' })
    complaint.statusTimeline = buildStatusTimeline(complaint)
    return res.json({ complaint, nextStatus: nextStatus[complaint.status] || null })
  } catch (error) { next(error) }
})

router.post('/complaints/:ticketId/comments', ...staffOnly, async (req, res, next) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : ''
    if (!message) return res.status(400).json({ message: 'A response is required.' })
    if (message.length > 2000) return res.status(400).json({ message: 'Responses must be 2000 characters or fewer.' })
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId, ...departmentQuery(req.user) })
    if (!complaint) return res.status(404).json({ message: 'Complaint not found in your department.' })
    const comment = await Comment.create({ complaintId: complaint._id, userId: req.user._id, message })
    return res.status(201).json({ message: 'Response added.', comment })
  } catch (error) { next(error) }
})

router.patch('/complaints/:ticketId/status', ...staffOnly, async (req, res, next) => {
  try {
    const status = req.body.status
    if (!statuses.includes(status)) return res.status(400).json({ message: 'Choose a valid complaint status.' })
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId, ...departmentQuery(req.user) })
    if (!complaint) return res.status(404).json({ message: 'Complaint not found in your department.' })
    if (nextStatus[complaint.status] !== status) {
      return res.status(400).json({ message: `A complaint in ${complaint.status} can move to ${nextStatus[complaint.status] || 'no further status'}.` })
    }
    const changedAt = new Date()
    if (!complaint.statusHistory.some((entry) => entry.status === complaint.status)) {
      complaint.statusHistory.push({ status: complaint.status, changedAt: complaint.updatedAt || complaint.createdAt })
    }
    complaint.status = status
    complaint.statusHistory.push({ status, changedAt })
    if (status === 'Assigned' && !complaint.assignedTo) complaint.assignedTo = req.user._id
    await complaint.save()
    if (status === 'Assigned') void notifyComplaint(req.user.email, 'Complaint assigned', complaint, `assigned:${complaint._id}:${req.user._id}:${changedAt.toISOString()}`)
    try {
      const customer = await User.findOne({ _id: complaint.userId, role: 'Customer' }).select('email').lean()
      if (customer) void notifyComplaint(customer.email, status === 'Resolved' ? 'Complaint resolved' : 'Complaint status updated', complaint, `status:${complaint._id}:${status}:${changedAt.toISOString()}`)
    } catch (emailLookupError) {
      console.error(`[Email] Could not prepare status notification for ${complaint.ticketId}: ${emailLookupError.message}`)
    }
    return res.json({ message: 'Complaint status updated.', complaint })
  } catch (error) { next(error) }
})

export default router
