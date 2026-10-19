import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const departments = ['Finance Support', 'Technical Support', 'Delivery/Logistics', 'Product Support', 'Account Support', 'Customer Support', 'Security Team']
const { STAFF_NAME: name, STAFF_EMAIL: email, STAFF_PASSWORD: password, STAFF_DEPARTMENT: department } = process.env

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env first.')
if (!name?.trim() || !email?.trim() || !password) throw new Error('Set STAFF_NAME, STAFF_EMAIL, and STAFF_PASSWORD before running this script.')
if (password.length < 6) throw new Error('STAFF_PASSWORD must be at least 6 characters.')
if (!departments.includes(department)) throw new Error(`STAFF_DEPARTMENT must be one of: ${departments.join(', ')}`)

try {
  await mongoose.connect(process.env.MONGODB_URI)
  const normalizedEmail = email.trim().toLowerCase()
  if (await User.exists({ email: normalizedEmail })) throw new Error(`An account already exists for ${normalizedEmail}.`)
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'Support Staff', department })
  console.log(`Created Support Staff account for ${user.email} in ${user.department}.`)
} finally {
  await mongoose.disconnect()
}
