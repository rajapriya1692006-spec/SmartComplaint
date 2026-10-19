export function buildAttachmentHeaders(attachment, contents, download = false) {
  const fallbackName = attachment.originalName.replace(/[^\x20-\x7E]|["\\]/g, '_') || 'attachment'
  const encodedName = encodeURIComponent(attachment.originalName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  const disposition = download ? 'attachment' : 'inline'
  return {
    'Content-Type': attachment.mimeType,
    'Content-Length': String(contents.length),
    'Content-Disposition': `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }
}
