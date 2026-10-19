import 'dotenv/config'

// These labels match the values already used by the complaint model and UI.
export const CATEGORIES = ['Payment Issue', 'Technical Issue', 'Delivery Issue', 'Product Issue', 'Account/Login Issue', 'Refund Issue', 'Service Issue', 'Security Issue', 'General Complaint', 'Other']
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
export const DEPARTMENTS = ['Finance Support', 'Technical Support', 'Delivery/Logistics', 'Product Support', 'Account Support', 'Customer Support', 'Security Team']

export const fallbackAnalysis = {
  category: 'General Complaint',
  priority: 'Medium',
  department: 'Customer Support',
  confidence: 0,
  explanation: 'AI analysis unavailable. The complaint was saved successfully.',
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    priority: { type: 'string', enum: PRIORITIES },
    department: { type: 'string', enum: DEPARTMENTS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    explanation: { type: 'string' },
  },
  required: ['category', 'priority', 'department', 'confidence', 'explanation'],
}

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('Ollama response did not contain text.')
  const unwrapped = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim()
  try { return JSON.parse(unwrapped) } catch { /* Ollama may add prose around its JSON. */ }
  const start = unwrapped.indexOf('{')
  if (start < 0) throw new Error('Ollama response did not contain JSON.')
  let depth = 0
  let quoted = false
  let escaped = false
  for (let i = start; i < unwrapped.length; i += 1) {
    const char = unwrapped[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return JSON.parse(unwrapped.slice(start, i + 1))
  }
  throw new Error('Ollama response contained incomplete JSON.')
}

function validateAnalysis(value) {
  if (!value || !CATEGORIES.includes(value.category) || !PRIORITIES.includes(value.priority) || !DEPARTMENTS.includes(value.department)) throw new Error('Ollama returned an unsupported classification.')
  const confidence = Number(value.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Ollama returned invalid confidence.')
  if (typeof value.explanation !== 'string' || !value.explanation.trim()) throw new Error('Ollama returned no explanation.')
  return { category: value.category, priority: value.priority, department: value.department, confidence: Number(confidence.toFixed(2)), explanation: value.explanation.trim().slice(0, 500) }
}

export async function analyzeComplaint({ subject, description }) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    console.log('[AI] Ollama request sent.')
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        prompt: `Classify the customer's actual issue, not just a word in the message. Choose exactly one value from each list. Categories: ${CATEGORIES.join(', ')}. Priorities: ${PRIORITIES.join(', ')}. Departments: ${DEPARTMENTS.join(', ')}.\n\nDepartment routing rules: payments, charges, invoices, billing, and refunds go to Finance Support; login and account access go to Account Support; delivery, shipping, and tracking go to Delivery/Logistics; broken or defective items go to Product Support; software bugs and service outages go to Technical Support; privacy breaches and unauthorized access go to Security Team. Use Customer Support for general questions, compliments, or issues that do not fit another department.\n\nPriority rules: Critical is only for an active security compromise, immediate safety risk, or severe ongoing disruption. High is for a major blocked service or substantial financial impact. Medium is for a normal unresolved issue. Low is for minor questions or positive feedback. Do not mark a routine delay, isolated broken item, or one-screen application bug Critical.\n\nConfidence must be between 0 and 1. Give a realistic nonzero confidence when the complaint is understandable, and explain the evidence for the category and priority briefly. Return only JSON matching the required fields: category, priority, department, confidence, explanation.\n\nSubject: ${subject}\n\nDescription: ${description}`,
      }),
    })
    if (!response.ok) throw new Error(`Ollama request failed (${response.status}).`)
    const payload = await response.json()
    console.log('[AI] Ollama response received.')
    return validateAnalysis(extractJson(payload.response))
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Ollama request timed out.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
