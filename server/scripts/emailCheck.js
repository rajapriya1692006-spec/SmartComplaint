import 'dotenv/config'
import { logSmtpError, sendTestEmail, verifySmtp } from '../src/services/emailService.js'

const [action, recipient] = process.argv.slice(2)

if (process.env.NODE_ENV === 'production') {
  console.error('Email diagnostics are disabled when NODE_ENV=production.')
  process.exit(1)
}

try {
  if (action === 'verify') {
    await verifySmtp()
    console.log('SMTP_VERIFY_OK: the server accepted the connection and authentication.')
  } else if (action === 'send') {
    if (!recipient) throw new Error('Usage: npm run email:test -- recipient@example.com')
    const info = await sendTestEmail(recipient)
    if (!info.accepted?.length) throw new Error('The SMTP server did not accept the test recipient.')
    console.log(`SMTP_TEST_ACCEPTED: the server accepted the message for ${info.accepted.length} recipient(s). Message ID: ${info.messageId || 'not provided'}`)
    if (info.rejected?.length) console.error(`SMTP_TEST_REJECTED: ${info.rejected.length} recipient(s).`)
  } else {
    throw new Error('Choose "verify" or "send".')
  }
} catch (error) {
  logSmtpError('SMTP diagnostic failed', error)
  process.exitCode = 1
}
