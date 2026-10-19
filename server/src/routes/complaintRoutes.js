import express from 'express'
import Complaint from '../models/Complaint.js'
import User from '../models/User.js'
import { authenticate, authorize } from '../middleware/authMiddleware.js'
import { analyzeComplaint, fallbackAnalysis } from '../services/aiService.js'
import { buildStatusTimeline } from '../services/statusTimeline.js'
import { complaintUpload, verifyAttachmentSignature } from '../middleware/complaintUpload.js'
import { saveAttachment, readAttachment } from '../services/attachmentStorage.js'
import { canAccessComplaintAttachment, complaintAttachmentLookup } from '../services/attachmentAccess.js'
import { buildAttachmentHeaders } from '../services/attachmentResponse.js'
import { notifyComplaint } from '../services/emailService.js'

const router = express.Router()
const customerOnly = [authenticate, authorize('Customer')]
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const nextTicketId = async () => {
  const latest = await Complaint.findOne().sort({ ticketId: -1 }).select('ticketId').lean()
  const number = latest ? Number(latest.ticketId.replace('CMP-', '')) + 1 : 10001
  return `CMP-${number}`
}

const chooseStaffForDepartment = async (department) => {
  const staff = await User.find({ role: 'Support Staff', department }).select('_id').lean()
  if (!staff.length) return null
  const active = await Complaint.aggregate([
    { $match: { assignedTo: { $in: staff.map(({ _id }) => _id) }, status: { $nin: ['Resolved', 'Closed'] } } },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
  ])
  const loads = new Map(active.map(({ _id, count }) => [_id.toString(), count]))
  return staff.sort((a, b) => (loads.get(a._id.toString()) || 0) - (loads.get(b._id.toString()) || 0))[0]._id
}

router.post('/', ...customerOnly, (req, res, next) => complaintUpload(req, res, next), async (req, res, next) => {
  try {
    const { subject, description } = req.body
    if (!subject?.trim() || !description?.trim()) return res.status(400).json({ message: 'Subject and description are required.' })
    if (!verifyAttachmentSignature(req.file)) return res.status(400).json({ message: 'The attachment content does not match a supported PDF, JPG, or PNG file.' })
    let complaint
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        complaint = await Complaint.create({ ticketId: await nextTicketId(), userId: req.user._id, subject: subject.trim(), description: description.trim(), aiStatus: 'Pending', statusHistory: [{ status: 'Submitted', changedAt: new Date() }] })
        break
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error
      }
    }
    if (req.file) {
      const attachment = await saveAttachment(req.file)
      complaint.attachments.push(attachment)
      await complaint.save()
      const savedAttachment = complaint.attachments.at(-1)
      console.info(`[Attachment] Stored ticket=${complaint.ticketId} attachment=${savedAttachment._id} type=${attachment.mimeType} bytes=${attachment.size}`)
    }
    void notifyComplaint(req.user.email, 'Complaint submitted', complaint, `submitted:${complaint._id}`)
    console.log(`[AI] Starting complaint analysis for ${complaint.ticketId}...`)
    console.log(`[AI] Model: ${process.env.OLLAMA_MODEL || 'llama3.2:3b'}`)
    let analysisFallback = false
    try {
      const analysis = await analyzeComplaint({ subject: complaint.subject, description: complaint.description })
      const assignedTo = await chooseStaffForDepartment(analysis.department)
      const analyzedAt = new Date()
      complaint.statusHistory.push({ status: 'AI Analyzed', changedAt: analyzedAt })
      if (assignedTo) complaint.statusHistory.push({ status: 'Assigned', changedAt: analyzedAt })
      Object.assign(complaint, { category: analysis.category, priority: analysis.priority, department: analysis.department, confidence: analysis.confidence, aiReason: analysis.explanation, aiStatus: 'Completed', assignedTo, status: assignedTo ? 'Assigned' : 'AI Analyzed' })
      await complaint.save()
      if (assignedTo) {
        void notifyComplaint(req.user.email, 'Complaint assigned', complaint, `assigned:${complaint._id}:${assignedTo}`)
        try {
          const assignedStaff = await User.findOne({ _id: assignedTo, role: 'Support Staff' }).select('email').lean()
          if (assignedStaff) void notifyComplaint(assignedStaff.email, 'Complaint assigned', complaint, `assigned:${complaint._id}:${assignedTo}`)
        } catch (emailLookupError) {
          console.error(`[Email] Could not look up assigned staff for ${complaint.ticketId}: ${emailLookupError.message}`)
        }
      }
      console.log(`[AI] Analysis saved for ${complaint.ticketId}; ${assignedTo ? `routed to ${analysis.department} staff` : `queued for ${analysis.department}`}.`)
      console.log(`[AI] Category: ${analysis.category} | Priority: ${analysis.priority} | Department: ${analysis.department}`)
    } catch (error) {
      analysisFallback = true
      console.error(`[AI] Ollama unavailable or analysis invalid for ${complaint.ticketId}: ${error.message}`)
      console.log('Ollama unavailable - complaint saved without AI analysis.')
      Object.assign(complaint, { category: fallbackAnalysis.category, priority: fallbackAnalysis.priority, department: fallbackAnalysis.department, confidence: fallbackAnalysis.confidence, aiReason: fallbackAnalysis.explanation, aiStatus: 'Fallback', status: 'Submitted' })
      await complaint.save()
      console.log(`[AI] Fallback saved for ${complaint.ticketId}.`)
    }
    const safeComplaint = complaint.toObject()
    delete safeComplaint.notificationKeys
    for (const attachment of safeComplaint.attachments || []) delete attachment.storageName
    return res.status(201).json({ message: analysisFallback ? 'Complaint submitted successfully. AI analysis is currently unavailable, so it has been queued for support review.' : 'Complaint submitted and analyzed successfully.', analysisFallback, complaint: safeComplaint })
  } catch (error) { next(error) }
})

router.get('/:ticketId/attachments/:attachmentId', authenticate, authorize('Customer', 'Support Staff', 'Admin'), async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne(complaintAttachmentLookup(req.params.ticketId))
      // Select attachment leaf fields explicitly. Selecting both `attachments`
      // and `attachments.storageName` creates a MongoDB projection path collision.
      .select('userId department assignedTo attachments._id attachments.originalName attachments.mimeType attachments.size attachments.uploadedAt +attachments.storageName')
      .lean()
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' })
    if (!canAccessComplaintAttachment(req.user, complaint)) return res.status(403).json({ message: 'You are not allowed to view this attachment.' })
    const attachment = complaint.attachments?.find((item) => item._id.toString() === req.params.attachmentId)
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' })
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedMimeTypes.includes(attachment.mimeType)) return res.status(404).json({ message: 'Attachment metadata is invalid.' })
    let contents
    try {
      contents = await readAttachment(attachment.storageName)
    } catch (error) {
      console.error(`[Attachment] Read failed ticket=${complaint.ticketId || complaint._id} attachment=${attachment._id} code=${error.code || 'UNKNOWN'}`)
      return res.status(503).json({ message: 'The attachment file is currently inaccessible. Please try again later.' })
    }
    if (!contents) {
      console.warn(`[Attachment] File missing ticket=${complaint.ticketId || complaint._id} attachment=${attachment._id}`)
      return res.status(404).json({ message: 'The attachment file is missing from storage.' })
    }
    if (attachment.size !== contents.length) {
      console.warn(`[Attachment] Stored size differs from metadata ticket=${complaint.ticketId || complaint._id} attachment=${attachment._id}`)
    }
    res.set(buildAttachmentHeaders(attachment, contents, req.query.download === '1'))
    console.info(`[Attachment] Served ticket=${complaint.ticketId || complaint._id} attachment=${attachment._id} bytes=${contents.length}`)
    return res.send(contents)
  } catch (error) { next(error) }
})

router.get('/my', ...customerOnly, async (req, res, next) => {
  try {
    const { search = '', status, category, priority } = req.query
    const query = { userId: req.user._id }
    if (status) query.status = status
    if (category) query.category = category
    if (priority) query.priority = priority
    if (search.trim()) {
      const safeSearch = new RegExp(escapeRegex(search.trim()), 'i')
      query.$or = [{ ticketId: safeSearch }, { subject: safeSearch }]
    }
    const complaints = await Complaint.find(query).sort({ createdAt: -1 }).lean()
    return res.json({ complaints })
  } catch (error) { next(error) }
})

router.get('/:ticketId', ...customerOnly, async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({ ticketId: req.params.ticketId, userId: req.user._id }).lean()
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' })
    complaint.statusTimeline = buildStatusTimeline(complaint)
    return res.json({ complaint })
  } catch (error) { next(error) }
})

router.put('/:ticketId', ...customerOnly, async (req, res, next) => {
  try {
    const updates = {}
    if (req.body.subject !== undefined) updates.subject = req.body.subject
    if (req.body.description !== undefined) updates.description = req.body.description
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide a subject or description to update.' })
    const complaint = await Complaint.findOneAndUpdate({ ticketId: req.params.ticketId, userId: req.user._id }, updates, { new: true, runValidators: true })
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' })
    return res.json({ message: 'Complaint updated successfully.', complaint })
  } catch (error) { next(error) }
})

export default router
