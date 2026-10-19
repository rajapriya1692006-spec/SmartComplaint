import test from 'node:test'
import assert from 'node:assert/strict'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { saveAttachment, readAttachment } from '../src/services/attachmentStorage.js'
import { canAccessComplaintAttachment, complaintAttachmentLookup } from '../src/services/attachmentAccess.js'
import { buildAttachmentHeaders } from '../src/services/attachmentResponse.js'
import { verifyAttachmentSignature } from '../src/middleware/complaintUpload.js'

test('PDF upload stores matching generated name, metadata, and bytes under uploads', async () => {
  const buffer = Buffer.from('%PDF-1.7\nSmartComplaint attachment test\n%%EOF')
  const attachment = await saveAttachment({
    buffer,
    size: buffer.length,
    mimetype: 'application/pdf',
    originalname: 'payment-receipt.pdf',
  })

  try {
    assert.match(attachment.storageName, /^[a-f0-9-]+\.pdf$/i)
    assert.equal(attachment.originalName, 'payment-receipt.pdf')
    assert.equal(attachment.mimeType, 'application/pdf')
    assert.equal(attachment.size, buffer.length)
    assert.deepEqual(await readAttachment(attachment.storageName), buffer)
  } finally {
    await unlink(path.resolve('uploads', attachment.storageName))
  }
})

test('PDF upload signature accepts PDF bytes and rejects mislabeled contents', () => {
  assert.equal(verifyAttachmentSignature({ mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7') }), true)
  assert.equal(verifyAttachmentSignature({ mimetype: 'application/pdf', buffer: Buffer.from('not a PDF') }), false)
})

test('missing attachment file is reported as missing', async () => {
  assert.equal(await readAttachment(`${randomUUID()}.pdf`), null)
})

test('attachment access allows owner, department staff, assigned staff, and admins only', () => {
  const complaint = { userId: 'customer-1', assignedTo: 'staff-1', department: 'Finance Support' }
  assert.equal(canAccessComplaintAttachment({ _id: 'customer-1', role: 'Customer' }, complaint), true)
  assert.equal(canAccessComplaintAttachment({ _id: 'staff-2', role: 'Support Staff', department: ' finance   support ' }, complaint), true)
  assert.equal(canAccessComplaintAttachment({ _id: 'staff-1', role: 'Support Staff', department: 'Other' }, complaint), true)
  assert.equal(canAccessComplaintAttachment({ _id: 'admin-1', role: 'Admin' }, complaint), true)
  assert.equal(canAccessComplaintAttachment({ _id: 'customer-2', role: 'Customer' }, complaint), false)
  assert.equal(canAccessComplaintAttachment({ _id: 'staff-3', role: 'Support Staff', department: 'Other' }, complaint), false)
  assert.equal(canAccessComplaintAttachment({ _id: 'staff-4', role: 'Support Staff' }, { userId: 'customer-1' }), false)
})

test('attachment lookup distinguishes Mongo complaint ids from public ticket ids', () => {
  assert.deepEqual(complaintAttachmentLookup('67a1bc23d456e78901234567'), { _id: '67a1bc23d456e78901234567' })
  assert.deepEqual(complaintAttachmentLookup('CMP-10018'), { ticketId: 'CMP-10018' })
})

test('PDF response headers support browser opening and download with correct metadata', () => {
  const attachment = { mimeType: 'application/pdf', originalName: 'payment receipt.pdf' }
  const contents = Buffer.from('%PDF-1.7')
  const inlineHeaders = buildAttachmentHeaders(attachment, contents)
  assert.equal(inlineHeaders['Content-Type'], 'application/pdf')
  assert.equal(inlineHeaders['Content-Length'], String(contents.length))
  assert.match(inlineHeaders['Content-Disposition'], /^inline;/)
  assert.match(inlineHeaders['Content-Disposition'], /filename\*=UTF-8''payment%20receipt\.pdf/)
  assert.equal(inlineHeaders['X-Content-Type-Options'], 'nosniff')
  assert.equal(inlineHeaders['Cache-Control'], 'private, no-store')
  assert.match(buildAttachmentHeaders(attachment, contents, true)['Content-Disposition'], /^attachment;/)
})
