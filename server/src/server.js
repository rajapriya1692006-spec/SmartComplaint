import 'dotenv/config'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import mongoose from 'mongoose'
import authRoutes from './routes/authRoutes.js'
import complaintRoutes from './routes/complaintRoutes.js'
import staffRoutes from './routes/staffRoutes.js'
import commentRoutes from './routes/commentRoutes.js'
import adminRoutes from './routes/adminRoutes.js'

const requiredEnv = ['MONGODB_URI', 'JWT_SECRET']
const missingEnv = requiredEnv.filter((name) => !process.env[name])
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`)
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 5000
const clientUrls = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || clientUrls.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked request from ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ message: 'SmartComplaint server is running', phase: 10 })
})
app.use('/api/auth', authRoutes)
app.use('/api/comments', commentRoutes)
app.use('/api/complaints', complaintRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/admin', adminRoutes)

app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }))
app.use((error, req, res, _next) => {
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Attachments must be 5 MB or smaller.' })
  if (error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'Upload one attachment per complaint.' })
  if (error.name === 'MulterError' || error.message === 'Upload a PDF, JPG, JPEG, or PNG file.') return res.status(400).json({ message: error.message })
  if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' })
  if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors)[0].message })
  console.error(`[API error] ${req.method} ${req.originalUrl}:`, error.stack || error)
  return res.status(500).json({ message: 'Something went wrong. Please try again.' })
})

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully.')
    app.listen(PORT, () => console.log(`SmartComplaint API running at http://localhost:${PORT}`))
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message)
    process.exit(1)
  })
