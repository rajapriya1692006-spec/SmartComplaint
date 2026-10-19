import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const uploadsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')

export async function saveAttachment(file) {
  if (!file?.buffer || !Number.isFinite(file.size) || file.size !== file.buffer.length) {
    throw new Error('Attachment upload data is incomplete.')
  }
  const storageName = `${randomUUID()}${file.mimetype === 'application/pdf' ? '.pdf' : file.mimetype === 'image/jpeg' ? '.jpg' : '.png'}`
  await mkdir(uploadsDirectory, { recursive: true })
  const storedPath = path.join(uploadsDirectory, storageName)
  await writeFile(storedPath, file.buffer, { flag: 'wx' })
  const savedFile = await stat(storedPath)
  if (!savedFile.isFile() || savedFile.size !== file.size) throw new Error('Stored attachment verification failed.')
  const originalName = path.basename(file.originalname).replace(/[\r\n\0]/g, '').slice(0, 180) || 'attachment'
  return { storageName, originalName, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() }
}

export async function readAttachment(storageName) {
  if (!/^[a-f0-9-]+\.(pdf|jpg|png)$/i.test(storageName)) return null
  try {
    const storedPath = path.join(uploadsDirectory, storageName)
    const metadata = await stat(storedPath)
    if (!metadata.isFile()) return null
    return await readFile(storedPath)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }
}
