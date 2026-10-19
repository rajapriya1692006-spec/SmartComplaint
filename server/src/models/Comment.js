import mongoose from 'mongoose'

const commentSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, required: [true, 'A message is required.'], trim: true, maxlength: 2000 },
}, { timestamps: { createdAt: true, updatedAt: false } })

export default mongoose.model('Comment', commentSchema)
