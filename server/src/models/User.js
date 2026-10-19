import mongoose from 'mongoose'
import bcrypt from 'bcrypt'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required.'], trim: true, maxlength: 100 },
    email: { type: String, required: [true, 'Email is required.'], unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address.'] },
    password: { type: String, required: [true, 'Password is required.'], minlength: 6, select: false },
    role: { type: String, enum: ['Customer', 'Support Staff', 'Admin'], default: 'Customer' },
    department: {
      type: String,
      trim: true,
      enum: ['Finance Support', 'Technical Support', 'Delivery/Logistics', 'Product Support', 'Account Support', 'Customer Support', 'Security Team', null],
      required() { return this.role === 'Support Staff' },
      default: null,
    },
  },
  { timestamps: true }
)

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = function comparePassword(candidatePassword) { return bcrypt.compare(candidatePassword, this.password) }
userSchema.methods.toSafeObject = function toSafeObject() {
  return { id: this._id, name: this.name, email: this.email, role: this.role, department: this.department, createdAt: this.createdAt, updatedAt: this.updatedAt }
}

export default mongoose.model('User', userSchema)
