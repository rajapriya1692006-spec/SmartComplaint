import nodemailer from 'nodemailer'
import Complaint from '../models/Complaint.js'

let transporter

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidSender(value) {
  if (isValidEmail(value)) return true
  if (typeof value !== 'string' || value.length > 320) return false
  const match = value.match(/^.{1,200}<([^<>]+)>$/)
  return Boolean(match && isValidEmail(match[1].trim()))
}

function requiredSettings() {
  const missing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM']
    .filter((name) => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Missing SMTP setting(s): ${missing.join(', ')}`)
  if (!isValidEmail(process.env.SMTP_USER)) throw new Error('SMTP_USER must be a valid email address.')
  if (!isValidSender(process.env.EMAIL_FROM)) throw new Error('EMAIL_FROM must be a valid email address, optionally with a display name.')
  const port = Number(process.env.SMTP_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid TCP port.')
  return port
}

function getTransporter() {
  const port = requiredSettings()
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Gmail port 465 uses implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    })
  }
  return transporter
}

function safeDiagnostic(value) {
  let result = String(value ?? '')
  const secretValues = Object.entries(process.env)
    .filter(([name]) => /(?:PASS|SECRET|TOKEN|API_KEY|CREDENTIAL|AUTH)/i.test(name) || name === 'SMTP_USER')
    .map(([, value]) => value)
  for (const secret of secretValues) {
    if (secret) result = result.split(secret).join('[REDACTED]')
  }
  return result.replace(/(password|passwd|pass|token|authorization|auth)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
}

export function logSmtpError(context, error) {
  const fields = {
    code: error?.code,
    message: error?.message,
    responseCode: error?.responseCode,
    response: error?.response,
  }
  const safeFields = Object.fromEntries(Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, safeDiagnostic(value)]))
  console.error(`[Email] ${context}: ${JSON.stringify(safeFields)}`)
}

export async function verifySmtp() {
  await getTransporter().verify()
  return true
}

export async function sendTestEmail(recipient) {
  if (!isValidEmail(recipient)) throw new Error('Provide a valid recipient email address.')
  const mailer = getTransporter()
  return mailer.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipient,
    subject: 'SmartComplaint SMTP test',
    text: 'This test message confirms that SmartComplaint can submit email through its configured SMTP server.',
  })
}

// Claim each persisted event atomically before sending, preventing retries from
// sending duplicates. Notification errors never propagate into complaint flows.
export async function notifyComplaint(recipient, event, complaint, eventKey = `${event}:${recipient?.toLowerCase()}`) {
  if (!isValidEmail(recipient) || !complaint?._id) {
    if (recipient) console.error(`[Email] Skipping ${event.toLowerCase()} notification for ${complaint?.ticketId || 'unknown ticket'}: invalid recipient.`)
    return false
  }

  const notificationKey = `${eventKey}:${recipient.toLowerCase()}`
  try {
    const mailer = getTransporter()
    let claim
    try {
      claim = await Complaint.updateOne(
        { _id: complaint._id, notificationKeys: { $ne: notificationKey } },
        { $addToSet: { notificationKeys: notificationKey } },
      )
    } catch (error) {
      logSmtpError(`Could not record ${event.toLowerCase()} notification for ${complaint.ticketId}`, error)
      return false
    }
    if (!claim.modifiedCount) return false

    const details = [
      `Ticket ID: ${complaint.ticketId}`,
      `Complaint Subject: ${complaint.subject}`,
      `Category: ${complaint.category}`,
      `Priority: ${complaint.priority}`,
      `Department: ${complaint.department}`,
      `Status: ${complaint.status}`,
    ].join('\n')
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to: recipient,
      subject: `${event}: ${complaint.ticketId} — ${complaint.subject}`,
      text: `${event}\n\n${details}`,
    })
    return true
  } catch (error) {
    logSmtpError(`Could not send ${event.toLowerCase()} notification for ${complaint.ticketId}`, error)
    return false
  }
}
