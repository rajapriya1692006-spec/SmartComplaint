import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { authenticate } from '../middleware/authMiddleware.js'

const router = express.Router()
const emailPattern = /^\S+@\S+\.\S+$/
const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
const setAuthCookie = (res, token) => res.cookie('authToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 })

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email, and password are required.' })
    if (!emailPattern.test(email.trim())) return res.status(400).json({ message: 'Please provide a valid email address.' })
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    if (await User.exists({ email: email.trim().toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists.' })
    const user = await User.create({ name, email, password })
    setAuthCookie(res, signToken(user._id.toString()))
    return res.status(201).json({ message: 'Registration successful.', user: user.toSafeObject() })
  } catch (error) {
    console.error('[Auth register] Account creation failed:', error.stack || error)
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email?.trim() || !password) return res.status(400).json({ message: 'Email and password are required.' })
    if (!emailPattern.test(email.trim())) return res.status(400).json({ message: 'Please provide a valid email address.' })
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password')
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ message: 'Incorrect email or password.' })
    setAuthCookie(res, signToken(user._id.toString()))
    return res.json({ message: 'Login successful.', user: user.toSafeObject() })
  } catch (error) {
    console.error('[Auth login] Login failed:', error.stack || error)
    next(error)
  }
})

router.get('/me', authenticate, (req, res) => res.json({ user: req.user.toSafeObject() }))
router.post('/logout', (_req, res) => {
  res.clearCookie('authToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' })
  res.json({ message: 'Logout successful.' })
})
export default router
