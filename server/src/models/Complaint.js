import mongoose from 'mongoose'

const complaintSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: [true, 'Subject is required.'], trim: true, maxlength: 160 },
  description: { type: String, required: [true, 'Description is required.'], trim: true, maxlength: 5000 },
  category: { type: String, required: true, default: 'General Complaint' },
  priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
  department: { type: String, required: true, default: 'Customer Support' },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  aiReason: { type: String, default: 'AI analysis will be available in Phase 4.' },
  aiStatus: { type: String, enum: ['Pending', 'Completed', 'Fallback'], default: 'Pending' },
  status: { type: String, enum: ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed'], default: 'Submitted' },
  statusHistory: [{
    status: { type: String, enum: ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed'], required: true },
    changedAt: { type: Date, required: true },
  }],
  notificationKeys: { type: [String], default: [], select: false },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  attachments: [{
    storageName: { type: String, required: true, select: false },
    originalName: { type: String, required: true, maxlength: 180 },
    mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true, max: 5 * 1024 * 1024 },
    uploadedAt: { type: Date, default: Date.now },
  }],
  comments: [{
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

complaintSchema.index({ department: 1, priority: 1, createdAt: -1 })

export default mongoose.model('Complaint', complaintSchema)
