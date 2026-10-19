import multer from 'multer'

const allowedTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
])

export const complaintUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (!extension || allowedTypes.get(extension) !== file.mimetype) return callback(new Error('Upload a PDF, JPG, JPEG, or PNG file.'))
    callback(null, true)
  },
}).single('attachment')

export function verifyAttachmentSignature(file) {
  if (!file) return true
  const bytes = file.buffer
  const isPdf = file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-'
  const isJpeg = file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return isPdf || isJpeg || isPng
}
