import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { FiActivity, FiCheckCircle, FiClock, FiFileText, FiUsers } from 'react-icons/fi'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api', withCredentials: true })
const priorities = ['Critical', 'High', 'Medium', 'Low']
const statuses = ['Submitted', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Closed']
const departments = ['Finance Support', 'Technical Support', 'Delivery/Logistics', 'Product Support', 'Account Support', 'Customer Support', 'Security Team']
const colors = ['#6557e8', '#4385e8', '#34a77a', '#efa841', '#e36c85', '#8c63c7', '#30a7b5']
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—'
const formatDuration = (ms) => {
  if (ms === null || ms === undefined) return '—'
  const hours = ms / 3600000
  return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`
}
const messageFor = (error) => error.response?.data?.message || 'Unable to load admin data.'

function Header({ title, subtitle, action }) { return <header className="admin-page-header"><div><p className="eyebrow">Administration</p><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</header> }
function ChartCard({ title, children }) { return <section className="card admin-chart-card"><h2>{title}</h2><div className="admin-chart">{children}</div></section> }
function LoadingOrError({ loading, error }) { if (loading) return <p className="muted">Loading admin data…</p>; if (error) return <p className="form-error">{error}</p>; return null }
function ComplaintTable({ complaints }) { return <div className="table-wrap"><table><thead><tr><th>Ticket ID</th><th>Subject</th><th>Category</th><th>Priority</th><th>Department</th><th>Status</th><th>Created date</th></tr></thead><tbody>{complaints?.length ? complaints.map((c) => <tr key={c._id}><td><b className="ticket">{c.ticketId}</b></td><td>{c.subject}</td><td>{c.category}</td><td><span className={`admin-priority priority-${String(c.priority).toLowerCase()}`}>{c.priority}</span></td><td>{c.department}</td><td>{c.status}</td><td>{formatDate(c.createdAt)}</td></tr>) : <tr><td colSpan="7">No complaints found.</td></tr>}</tbody></table></div> }

export function AdminDashboardPage() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { api.get('/admin/dashboard').then(({ data: result }) => setData(result)).catch((e) => setError(messageFor(e))).finally(() => setLoading(false)) }, [])
  const summary = data?.summary || {}
  const cards = [[FiFileText, 'Total complaints', summary.total, 'purple'], [FiCheckCircle, 'Resolved', summary.resolved, 'green'], [FiClock, 'Pending', summary.pending, 'amber'], [FiActivity, 'In progress', summary.inProgress, 'blue'], [FiUsers, 'Average resolution time', formatDuration(summary.averageResolutionMs), 'purple']]
  return <div className="admin-page"><Header title="Admin dashboard" subtitle="A complete view of complaint activity and resolution." /><LoadingOrError loading={loading} error={error} />{data && <>
    <div className="stat-grid admin-stat-grid">{cards.map(([Icon, label, value, color]) => <article className="card stat" key={label}><span className={`stat-icon ${color}`}><Icon /></span><div><b>{value ?? 0}</b><p>{label}</p></div></article>)}</div>
    <div className="admin-chart-grid">
      <ChartCard title="Complaints by Category"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.analytics.byCategory} layout="vertical" margin={{ left: 14, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" fill="#6557e8" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Complaints by Priority"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.analytics.byPriority} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" radius={[6, 6, 0, 0]}>{data.analytics.byPriority.map((entry, index) => <Cell key={entry.name} fill={['#df5363', '#ed9c44', '#6557e8', '#3ea77d'][index]} />)}</Bar></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Complaints by Department"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.analytics.byDepartment} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={124} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="count" fill="#4385e8" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Complaints by Status"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.analytics.byStatus} dataKey="count" nameKey="name" cx="50%" cy="48%" innerRadius={48} outerRadius={83} paddingAngle={2}>{data.analytics.byStatus.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Monthly Complaint Trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.analytics.monthly} margin={{ top: 12, right: 14, left: -16, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" name="Complaints" stroke="#6557e8" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></ChartCard>
    </div>
    <section className="card admin-recent"><div className="admin-section-heading"><div><p className="eyebrow">Latest activity</p><h2>Recent complaints</h2></div></div><ComplaintTable complaints={data.recentComplaints} /></section>
  </>}</div>
}

export function AdminReportsPage() {
  const [analytics, setAnalytics] = useState(null), [error, setError] = useState('')
  useEffect(() => { api.get('/admin/dashboard').then(({ data }) => setAnalytics(data.analytics)).catch((e) => setError(messageFor(e))) }, [])
  return <div className="admin-page"><Header title="Reports & analytics" subtitle="Complaint volume, routing, urgency, and outcomes." /><LoadingOrError loading={!analytics && !error} error={error} />{analytics && <div className="admin-chart-grid">
    <ChartCard title="Complaints by Category"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.byCategory} layout="vertical" margin={{ left: 14, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" fill="#6557e8" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></ChartCard>
    <ChartCard title="Complaints by Priority"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.byPriority}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#e78d49" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
    <ChartCard title="Complaints by Department"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.byDepartment} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={124} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="count" fill="#4385e8" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></ChartCard>
    <ChartCard title="Complaints by Status"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analytics.byStatus} dataKey="count" nameKey="name" cx="50%" cy="48%" innerRadius={48} outerRadius={83}>{analytics.byStatus.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></ChartCard>
    <ChartCard title="Monthly Complaint Trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#6557e8" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></ChartCard>
  </div>}</div>
}

export function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState([]), [staff, setStaff] = useState([]), [error, setError] = useState(''), [filters, setFilters] = useState({ search: '', department: '', status: '' })
  const load = () => Promise.all([api.get('/admin/complaints', { params: filters }), api.get('/admin/users', { params: { role: 'Support Staff' } })]).then(([complaintResult, staffResult]) => { setComplaints(complaintResult.data.complaints); setStaff(staffResult.data.users); setError('') }).catch((e) => setError(messageFor(e)))
  useEffect(() => { load() }, [filters])
  const assign = async (ticketId, staffId) => { try { await api.patch(`/admin/complaints/${ticketId}/assignment`, { staffId: staffId || null }); await load() } catch (e) { setError(messageFor(e)) } }
  const updateStatus = async (ticketId, status) => { try { await api.patch(`/admin/complaints/${ticketId}/status`, { status }); await load() } catch (e) { setError(messageFor(e)) } }
  return <div className="admin-page"><Header title="All complaints" subtitle="Assign tickets and manage their current status." />{error && <p className="form-error">{error}</p>}<section className="card admin-table-card"><div className="admin-filters"><input aria-label="Search complaints" placeholder="Search ticket or subject" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select aria-label="Filter department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filter status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{statuses.map((name) => <option key={name}>{name}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Subject</th><th>Category</th><th>Priority</th><th>Department</th><th>Status</th><th>Created</th><th>Customer</th><th>Assigned staff</th><th>Change status</th></tr></thead><tbody>{complaints.length ? complaints.map((complaint) => <tr key={complaint._id}><td><b className="ticket">{complaint.ticketId}</b></td><td>{complaint.subject}</td><td>{complaint.category}</td><td><span className={`admin-priority priority-${String(complaint.priority).toLowerCase()}`}>{complaint.priority}</span></td><td>{complaint.department}</td><td>{complaint.status}</td><td>{formatDate(complaint.createdAt)}</td><td>{complaint.userId?.name || '—'}</td><td><select aria-label={`Assign ${complaint.ticketId}`} value={complaint.assignedTo?._id || ''} onChange={(e) => assign(complaint.ticketId, e.target.value)}><option value="">Unassigned</option>{staff.filter((person) => person.department?.trim().toLowerCase() === complaint.department?.trim().toLowerCase()).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></td><td><select aria-label={`Status for ${complaint.ticketId}`} value={complaint.status} onChange={(e) => updateStatus(complaint.ticketId, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>) : <tr><td colSpan="10">No complaints found.</td></tr>}</tbody></table></div></section></div>
}

export function AdminUsersPage() {
  const [users, setUsers] = useState([]), [role, setRole] = useState(''), [error, setError] = useState('')
  useEffect(() => { api.get('/admin/users', { params: role ? { role } : {} }).then(({ data }) => setUsers(data.users)).catch((e) => setError(messageFor(e))) }, [role])
  return <div className="admin-page"><Header title="Users" subtitle="Customers, support staff, and administrators." action={<select value={role} aria-label="Filter by role" onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option>Customer</option><option>Support Staff</option><option>Admin</option></select>} />{error && <p className="form-error">{error}</p>}<section className="card admin-table-card"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Joined</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.department || '—'}</td><td>{formatDate(user.createdAt)}</td></tr>) : <tr><td colSpan="5">No users found.</td></tr>}</tbody></table></div></section></div>
}

export function AdminDepartmentsPage() {
  const [items, setItems] = useState([]), [error, setError] = useState('')
  useEffect(() => { api.get('/admin/departments').then(({ data }) => setItems(data.departments)).catch((e) => setError(messageFor(e))) }, [])
  return <div className="admin-page"><Header title="Departments" subtitle="Support teams and their current workload." />{error && <p className="form-error">{error}</p>}<div className="admin-department-grid">{items.map((item, index) => <article className="card admin-department-card" key={item.name}><span className="admin-department-icon" style={{ background: `${colors[index]}1a`, color: colors[index] }}><FiUsers /></span><h2>{item.name}</h2><div><b>{item.staffCount}</b><span>Staff members</span></div><div><b>{item.complaintCount}</b><span>Complaints</span></div></article>)}</div></div>
}

export function AdminSettingsPage({ user }) { return <div className="admin-page"><Header title="Admin settings" subtitle="Administrator account and workspace access." /><section className="card admin-settings-card"><div className="admin-settings-avatar">{user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'AD'}</div><div><h2>{user?.name || 'Administrator'}</h2><p>{user?.email}</p><span className="admin-role-pill">{user?.role}</span></div><p className="muted">Admin access is protected by your authenticated account. Role changes are managed outside public registration.</p></section></div> }
