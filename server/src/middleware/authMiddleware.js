import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const getToken = (req) => req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : req.cookies?.authToken

export const authenticate = async (req, res, next) => {
  const token = getToken(req)
  if (!token) return res.status(401).json({ message: 'Authentication is required.' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId)
    if (!user) return res.status(401).json({ message: 'This account no longer exists.' })
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ message: error.name === 'TokenExpiredError' ? 'Your session has expired. Please sign in again.' : 'Your authentication token is invalid. Please sign in again.' })
  }
}

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You are not authorized to access this resource.' })
  next()
}
