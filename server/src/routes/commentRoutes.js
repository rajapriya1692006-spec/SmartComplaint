import express from 'express'
import Comment from '../models/Comment.js'
import Complaint from '../models/Complaint.js'
import { authenticate, authorize } from '../middleware/authMiddleware.js'

const router = express.Router()
router.use(authenticate, authorize('Customer', 'Support Staff'))

function staffDepartmentPattern(department) {
  const escaped = department.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`^\\s*${escaped}\\s*$`, 'i')
}

async function getAccessibleComplaint(ticketId, user) {
  const complaint = await Complaint.findOne({ ticketId }).populate('comments.authorId', 'name role')
  if (!complaint) return null
  if (user.role === 'Customer' && complaint.userId.toString() !== user._id.toString()) return null
  if (user.role === 'Support Staff' && (!user.department || !staffDepartmentPattern(user.department).test(complaint.department || ''))) return null
  return complaint
}

router.get('/:ticketId', async (req, res, next) => {
  try {
    const complaint = await getAccessibleComplaint(req.params.ticketId, req.user)
    if (!complaint) return res.status(404).json({ message: 'Complaint not found or you are not allowed to view its conversation.' })
    const savedComments = await Comment.find({ complaintId: complaint._id })
      .populate('userId', 'name role')
      .sort({ createdAt: 1 })
      .lean()
    const legacyComments = (complaint.comments || []).map((comment) => ({
      _id: comment._id,
      userId: comment.authorId ? { _id: comment.authorId._id, name: comment.authorId.name || comment.authorName, role: comment.authorId.role } : { name: comment.authorName },
      message: comment.message,
      createdAt: comment.createdAt,
    }))
    const comments = [...savedComments, ...legacyComments].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    return res.json({ comments })
  } catch (error) { next(error) }
})

router.post('/:ticketId', async (req, res, next) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : ''
    if (!message) return res.status(400).json({ message: 'A message is required.' })
    if (message.length > 2000) return res.status(400).json({ message: 'Messages must be 2000 characters or fewer.' })
    const complaint = await getAccessibleComplaint(req.params.ticketId, req.user)
    if (!complaint) return res.status(404).json({ message: 'Complaint not found or you are not allowed to reply to it.' })
    const comment = await Comment.create({ complaintId: complaint._id, userId: req.user._id, message })
    await comment.populate('userId', 'name role')
    return res.status(201).json({ message: 'Message added.', comment })
  } catch (error) { next(error) }
})

export default router
