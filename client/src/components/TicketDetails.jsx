import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiMessageCircle, FiPaperclip, FiSend } from 'react-icons/fi'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api', withCredentials: true })
const statusFlow = ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed']
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Historical date unavailable'
const statusTone = (status) => status === 'Resolved' || status === 'Closed' ? 'green' : status === 'In Progress' ? 'blue' : 'amber'

function TicketDetails({ staff = false }) {
  const { ticketId } = useParams()
  const [complaint, setComplaint] = useState(null)
  const [comments, setComments] = useState([])
  const [nextStatus, setNextStatus] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [openingAttachment, setOpeningAttachment] = useState('')

  const load = async () => {
    setError('')
    try {
      const detailPath = staff ? `/staff/complaints/${ticketId}` : `/complaints/${ticketId}`
      const [detail, conversation] = await Promise.all([api.get(detailPath), api.get(`/comments/${ticketId}`)])
      setComplaint(detail.data.complaint)
      setNextStatus(detail.data.nextStatus || null)
      setComments(conversation.data.comments || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load this support ticket.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setLoading(true); load() }, [ticketId, staff])

  const sendMessage = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const message = new FormData(form).get('message')
    setSending(true)
    setError('')
    try {
      await api.post(`/comments/${ticketId}`, { message })
      form.reset()
      await load()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send your message.')
    } finally {
      setSending(false)
    }
  }

  const advanceStatus = async () => {
    if (!nextStatus) return
    setSending(true)
    setError('')
    try {
      await api.patch(`/staff/complaints/${ticketId}/status`, { status: nextStatus })
      await load()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update the ticket status.')
    } finally {
      setSending(false)
    }
  }

  const handleAttachment = async (attachment, action) => {
    setError('')
    let viewer = null
    let objectUrl = null
    if (action === 'open') {
      viewer = window.open('about:blank', '_blank')
      if (!viewer) {
        setError('Allow pop-ups to open this attachment in a new tab, or choose Download.')
        return
      }
      viewer.opener = null
      viewer.document.title = 'Opening attachment'
      viewer.document.body.textContent = 'Loading attachment…'
    }

    setOpeningAttachment(attachment._id)
    try {
      const downloadQuery = action === 'download' ? '?download=1' : ''
      const { data, headers } = await api.get(
        `/complaints/${encodeURIComponent(complaint.ticketId)}/attachments/${attachment._id}${downloadQuery}`,
        { responseType: 'blob' },
      )
      const blob = new Blob([data], { type: headers['content-type'] || attachment.mimeType })
      objectUrl = URL.createObjectURL(blob)
      if (viewer) {
        viewer.location.replace(objectUrl)
        const cleanupWhenClosed = window.setInterval(() => {
          if (viewer.closed) {
            window.clearInterval(cleanupWhenClosed)
            URL.revokeObjectURL(objectUrl)
          }
        }, 1000)
      } else {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = attachment.originalName
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      if (!viewer) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (requestError) {
      viewer?.close()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      let message = requestError.response?.data?.message
      if (!message && requestError.response?.data instanceof Blob) {
        try { message = JSON.parse(await requestError.response.data.text()).message } catch { /* use the safe fallback below */ }
      }
      setError(message || 'Unable to open this attachment. Check your access and try again.')
    } finally {
      setOpeningAttachment('')
    }
  }

  if (loading) return <div className="ticket-page"><p className="muted">Loading support ticket…</p></div>
  if (!complaint) return <div className="ticket-page"><Link className="back" to={staff ? '/staff/dashboard' : '/complaints'}><FiArrowLeft /> Back</Link><p className="form-error">{error}</p></div>

  const timeline = complaint.statusTimeline || []
  const completed = new Map(timeline.map((item) => [item.status, item]))
  const displayStatus = complaint.status || 'Submitted'

  return <div className="ticket-page">
    <Link className="back ticket-back" to={staff ? '/staff/dashboard' : '/complaints'}><FiArrowLeft /> Back to {staff ? 'staff dashboard' : 'my complaints'}</Link>
    {error && <p className="form-error" role="alert">{error}</p>}
    <header className="ticket-heading">
      <div><p className="eyebrow">Support ticket · {complaint.ticketId}</p><h1>{complaint.subject}</h1></div>
      <span className={`ticket-status ticket-status-${statusTone(displayStatus)}`}>{displayStatus}</span>
    </header>

    <section className="ticket-facts">
      {[['Category', complaint.category], ['Priority', complaint.priority], ['Department', complaint.department]].map(([label, value]) => <article className="card ticket-fact" key={label}><span>{label}</span><b>{value || '—'}</b></article>)}
    </section>

    {complaint.attachments?.length > 0 && <section className="card ticket-attachments"><div className="ticket-section-heading"><div><p className="eyebrow">Supporting files</p><h2>Attachments</h2></div></div><div className="ticket-attachment-list">{complaint.attachments.map((attachment) => <div className="attachment" key={attachment._id}><FiPaperclip /><b>{attachment.originalName}</b><span>{(attachment.size / (1024 * 1024)).toFixed(2)} MB</span><button className="attachment-action" type="button" disabled={openingAttachment === attachment._id} onClick={() => handleAttachment(attachment, 'open')}>Open</button><button className="attachment-action" type="button" disabled={openingAttachment === attachment._id} onClick={() => handleAttachment(attachment, 'download')}>Download</button></div>)}</div></section>}

    <section className="card ticket-ai">
      <div className="ticket-section-heading"><div><p className="eyebrow">SmartComplaint AI</p><h2>AI analysis</h2></div><span className="ticket-confidence">{complaint.aiStatus === 'Completed' ? `${Math.round((complaint.confidence || 0) * 100)}% confidence` : 'Unavailable'}</span></div>
      {complaint.aiStatus === 'Completed' ? <><div className="ticket-ai-facts">{[['AI Category', complaint.category], ['AI Priority', complaint.priority], ['AI Department', complaint.department]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><p className="ticket-reason"><b>AI reason</b><br />{complaint.aiReason}</p></> : <p className="muted">AI analysis is unavailable for this ticket.</p>}
    </section>

    <section className="card ticket-timeline">
      <div className="ticket-section-heading"><div><p className="eyebrow">Ticket timeline</p><h2>Complaint progress</h2></div></div>
      <div className="ticket-timeline-list">{statusFlow.map((status) => {
        const item = completed.get(status)
        return <div className={`ticket-timeline-item ${item ? 'is-complete' : ''}`} key={status}>
          <span className="ticket-timeline-dot" />
          <div><b>{status}</b><p>{item ? formatDate(item.changedAt) : 'Pending'}</p></div>
        </div>
      })}</div>
    </section>

    <section className="card ticket-conversation">
      <div className="ticket-section-heading"><div><p className="eyebrow">Conversation</p><h2><FiMessageCircle /> Customer and staff messages</h2></div></div>
      <div className="ticket-messages">{comments.length ? comments.map((comment, index) => {
        const isStaff = comment.userId?.role === 'Support Staff'
        return <article className={`ticket-message ${isStaff ? 'from-staff' : 'from-customer'}`} key={comment._id || index}>
          <div className="ticket-message-meta"><b>{comment.userId?.name || (isStaff ? 'Support staff' : 'Customer')}</b><span>{isStaff ? 'Staff' : 'Customer'} · {formatDate(comment.createdAt)}</span></div>
          <p>{comment.message}</p>
        </article>
      }) : <p className="muted">No messages yet. Send a message to start the conversation.</p>}</div>
      <form className="ticket-message-form" onSubmit={sendMessage}>
        <label htmlFor="ticket-message">Add a message</label>
        <textarea id="ticket-message" name="message" rows="4" maxLength="2000" required placeholder="Write your message…" />
        <div className="ticket-actions"><small>Up to 2000 characters</small><button className="btn btn-primary" type="submit" disabled={sending}><FiSend /> Send message</button></div>
      </form>
    </section>

    {staff && nextStatus && <button className="btn btn-secondary ticket-advance" type="button" disabled={sending} onClick={advanceStatus}>Update status to {nextStatus} <FiArrowRight /></button>}
  </div>
}

export default TicketDetails
