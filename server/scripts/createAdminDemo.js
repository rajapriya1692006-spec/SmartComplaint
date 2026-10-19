import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const { ADMIN_NAME: name, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env
if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env first.')
if (!name?.trim() || !email?.trim() || !password) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before running this script.')
if (password.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 characters.')

try {
  await mongoose.connect(process.env.MONGODB_URI)
  const normalizedEmail = email.trim().toLowerCase()
  if (await User.exists({ email: normalizedEmail })) throw new Error(`An account already exists for ${normalizedEmail}; no role changes were made.`)
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'Admin', department: null })
  console.log(`Created Admin account for ${user.email}.`)
} finally {
  await mongoose.disconnect()
}
