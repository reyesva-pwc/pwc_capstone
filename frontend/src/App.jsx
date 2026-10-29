import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API = { employees: 'http://localhost:8081', payroll: 'http://localhost:3001', analysis: 'http://localhost:8000' }
const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 })
const money = (value) => pesos.format(Number(value) || 0)

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PHOTO_MAX_BYTES = 2 * 1024 * 1024
const SALARY_RANGES ={ Associate: [20000, 60000], 'Senior Associate': [60001, 100000], Manager: [100001, null] }

const SESSION_KEY = 'payday-session'
const readSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    return session?.token && session.expiresAt > Date.now() ? session : null
  } catch { return null }
}
let onSessionExpired = () => {}

async function request(url, options = {}) {
  const session = readSession()
  const headers = { ...options.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }
  let response
  try { response = await fetch(url, { ...options, headers }) } catch { throw new Error('Could not reach the service. Check that it is running and try again.') }
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (response.status === 401 && session && !url.includes('/api/auth/')) onSessionExpired()
  if (!response.ok) {
    const detail = data?.error || data?.message || data?.detail
    const generic = { 400: 'Some details are invalid. Review the form and try again.', 404: 'The requested record was not found.', 409: 'A payroll run already exists for this employee and month.', 502: 'The employee service is unavailable. Start it and try again.', 503: 'This integration is currently unavailable.' }
    const failure = new Error(detail || generic[response.status] || `Service returned an error (${response.status}).`)
    if (data?.fieldErrors) failure.fieldErrors = data.fieldErrors
    throw failure
  }
  return data
}

function validateEmployee(form) {
  const problems = {}
  const name = form.fullName.trim()
  if (!name) problems.fullName = 'fullName is required'
  else if (name.length < 2 || name.length > 160) problems.fullName = 'fullName must be 2 to 160 characters'
  else if (!/^\p{L}+(?: +\p{L}+)*(?: +(?:jr|sr)\.)?$/iu.test(name)) problems.fullName = 'fullName may contain only letters and spaces (a period is allowed only in the suffix Jr. or Sr.)'

  if (!form.position) problems.position = 'position is required'

  const email = form.emailAddress.trim()
  if (!email) problems.emailAddress = 'emailAddress is required'
  else if (email.length > 254) problems.emailAddress = 'emailAddress must be at most 254 characters'
  else if (!/^[a-z0-9._%+-]+@pwc\.com$/i.test(email)) problems.emailAddress = 'emailAddress must be a valid address ending in @pwc.com'

  const contact = form.contactNumber.trim()
  if (!contact || contact === '+63') problems.contactNumber = 'contactNumber is required'
  else if (!/^\+63\d{10}$/.test(contact)) problems.contactNumber = 'contactNumber must start with +63 followed by 10 digits, e.g. +639171234567'

  const salaryText = String(form.baseSalary).trim()
  const salary = Number(salaryText)
  if (!salaryText) problems.baseSalary = 'baseSalary is required'
  else if (!Number.isFinite(salary) || salary <= 0) problems.baseSalary = 'baseSalary must be greater than 0'
  else if (!/^\d+(\.\d{1,2})?$/.test(salaryText)) problems.baseSalary = 'baseSalary can have at most 2 decimal places'
  else if (SALARY_RANGES[form.position]) {
    const [min, max] = SALARY_RANGES[form.position]
    if (salary < min || (max !== null && salary > max)) {
      problems.baseSalary = `baseSalary for ${form.position} must be ${max === null ? `${min.toLocaleString()} or above` : `between ${min.toLocaleString()} and ${max.toLocaleString()}`}`
    }
  }
  return problems
}

function Icon({ kind, size = 18 }) {
  const shapes = {
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 5h.01M7 5V3h11v2"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-3v6m3-3h-6"/></>,
    arrow: <><path d="m7 17 10-10M7 7h10v10"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Zm7 11 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z"/></>,
    cloud: <><path d="M20 16a5 5 0 0 0-2-9h-1a7 7 0 1 0-12 10h13a4 4 0 0 0 2-1Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/></>,
    trash: <><path d="M3 6h18m-2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-7 5v6m4-6v6"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5m-3-3a7 7 0 0 1 12-2l2 5M4 12l3 5a7 7 0 0 0 12-2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[kind]}</svg>
}

function Payslip({ run }) {
  const detailed = run.sss !== undefined
  return <>
    <h3>Pay breakdown · {run.fullName} · {run.period}</h3>
    <dl>
      <div><dt>Basic salary</dt><dd>{money(run.baseSalary)}</dd></div>
      <div><dt>Overtime pay ({run.overtimeHours} hrs)</dt><dd>{money(run.overtimePay)}</dd></div>
      <div className="total"><dt>Gross pay</dt><dd>{money(run.grossPay)}</dd></div>
      {detailed ? <>
        <div className="group"><dt>Mandatory contributions</dt><dd/></div>
        <div className="sub"><dt>SSS</dt><dd>− {money(run.sss)}</dd></div>
        <div className="sub"><dt>PhilHealth</dt><dd>− {money(run.philhealth)}</dd></div>
        <div className="sub"><dt>Pag-IBIG</dt><dd>− {money(run.pagibig)}</dd></div>
        <div><dt>Taxable income</dt><dd>{money(run.taxableIncome)}</dd></div>
        <div><dt>Withholding tax (BIR)</dt><dd>− {money(run.withholdingTax)}</dd></div>
        <div><dt>Other deductions</dt><dd>− {money(run.otherDeductions)}</dd></div>
      </> : null}
      <div className="total"><dt>Total deductions</dt><dd>− {money(run.deductions)}</dd></div>
      <div className="total net"><dt>Net pay</dt><dd>{money(run.netPay)}</dd></div>
    </dl>
    <p className="breakdown-note">{detailed ? 'Estimate using monthly Philippine rates. Not tax advice.' : 'Saved before tax and contribution details were tracked, so only the total deduction is available.'}</p>
  </>
}

const CHAT_GREETING = { role: 'assistant', content: 'Hi! Ask me about your employees or payroll runs. I only answer from the data in this app.' }
const CHAT_SUGGESTIONS = ['How many employees are there?', 'Who has the highest salary?', 'What was the total net pay processed?']

function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([CHAT_GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages, sending, open])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function send(text) {
    const question = text.trim()
    if (!question || sending) return
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next); setInput(''); setError(''); setSending(true)
    try {
      const history = next.filter((m) => m !== CHAT_GREETING).map(({ role, content }) => ({ role, content }))
      const data = await request(`${API.analysis}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
      setMessages((m) => [...m, { role: 'assistant', content: data.answer }])
    } catch (e) { setError(e.message) }
    finally { setSending(false) }
  }

  if (!open) return <button className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open payroll assistant"><Icon kind="chat" size={22}/></button>

  return <section className="chat-panel" role="dialog" aria-label="Payroll assistant">
    <header className="chat-header"><div><strong>Payroll assistant</strong><small>Answers only from your app data</small></div><button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button></header>
    <div className="chat-body" aria-live="polite">
      {messages.map((m, i) => <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>)}
      {messages.length === 1 && <div className="chat-suggestions">{CHAT_SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
      {sending && <div className="chat-msg assistant typing">Thinking…</div>}
      {error && <div className="chat-error" role="alert">{error}</div>}
      <div ref={endRef}/>
    </div>
    <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input) }}>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about employees or payroll…" maxLength={1000} aria-label="Your question" autoFocus/>
      <button disabled={sending || !input.trim()} aria-label="Send"><Icon kind="send" size={16}/></button>
    </form>
  </section>
}

function App({ user, onLogout }) {
  const isAdmin = user?.role === 'admin'
  const initials = (user?.emailAddress || '?').slice(0, 2).toUpperCase()
  const [employees, setEmployees] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState({ employees: true, runs: true })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [aws, setAws] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [photos, setPhotos] = useState({})
  const [lastRun, setLastRun] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [viewRun, setViewRun] = useState(null)
  const [employeeForm, setEmployeeForm] = useState({ fullName: '', position: '', emailAddress: '', contactNumber: '+63', baseSalary: '' })
  const [payrollForm, setPayrollForm] = useState({ employeeId: '', period: '2026-10', overtimeHours: '8', deductions: '500' })

  const loadEmployees = useCallback(async () => {
    setLoading((s) => ({ ...s, employees: true }))
    try { const data = await request(`${API.employees}/api/employees`); setEmployees(Array.isArray(data) ? data : []); setErrors((s) => ({ ...s, employees: '' })) }
    catch (e) { setErrors((s) => ({ ...s, employees: e.message })) }
    finally { setLoading((s) => ({ ...s, employees: false })) }
  }, [])
  const loadRuns = useCallback(async () => {
    setLoading((s) => ({ ...s, runs: true }))
    try { const data = await request(`${API.payroll}/api/payroll`); setRuns(Array.isArray(data) ? data : []); setErrors((s) => ({ ...s, runs: '' })) }
    catch (e) { setErrors((s) => ({ ...s, runs: e.message })) }
    finally { setLoading((s) => ({ ...s, runs: false })) }
  }, [])
  const loadPhotos = useCallback(async () => {
    try { const data = await request(`${API.payroll}/api/employee-images`); setPhotos(data && typeof data === 'object' ? data : {}) }
    catch { setPhotos({}) }
  }, [])
  useEffect(() => { loadEmployees(); loadRuns(); loadPhotos() }, [loadEmployees, loadRuns, loadPhotos])
  useEffect(() => {
    if (!viewRun) return
    const onKey = (e) => { if (e.key === 'Escape') setViewRun(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewRun])
  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e) => { if (e.key === 'Escape') closeDeleteDialog() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    if (employees.length && !employees.some((e) => String(e.id) === payrollForm.employeeId)) {
      const first = employees.find((e) => e.employeeCode === 'EMP001') || employees[0]
      setPayrollForm((f) => ({ ...f, employeeId: String(first.id) }))
    }
  }, [employees, payrollForm.employeeId])
  const totals = useMemo(() => ({ net: runs.reduce((n, r) => n + Number(r.netPay || 0), 0) }), [runs])

  async function addEmployee(event) {
    event.preventDefault(); setNotice(''); setErrors((s) => ({ ...s, employeeForm: '' }))
    const problems = validateEmployee(employeeForm)
    setFieldErrors(problems)
    if (Object.keys(problems).length) return
    setBusy('employee')
    try {
      const result = await request(`${API.employees}/api/employees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...employeeForm, baseSalary: Number(employeeForm.baseSalary) }) })
      setEmployeeForm({ fullName: '', position: '', emailAddress: '', contactNumber: '+63', baseSalary: '' }); setFieldErrors({}); setNotice(`${result.fullName} was added to the employee directory.`); await loadEmployees()
    } catch (e) {
      if (e.fieldErrors) setFieldErrors(e.fieldErrors)
      else setErrors((s) => ({ ...s, employeeForm: e.message }))
    }
    finally { setBusy('') }
  }
  async function deleteEmployee(employee) {
    setBusy(`delete-${employee.id}`); setNotice(''); setErrors((s) => ({ ...s, employees: '', deleteDialog: '' }))
    try {
      await request(`${API.employees}/api/employees/${employee.id}`, { method: 'DELETE' })
      if (photos[employee.id]) await request(`${API.payroll}/api/employee-images/${employee.id}`, { method: 'DELETE' }).catch(() => {})
      setPendingDelete(null); setNotice(`${employee.fullName} was removed from the employee directory.`); await Promise.all([loadEmployees(), loadPhotos()])
    } catch (e) { setErrors((s) => ({ ...s, deleteDialog: e.message })) }
    finally { setBusy('') }
  }
  async function uploadPhoto(employee, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setNotice(''); setErrors((s) => ({ ...s, employees: '' }))
    if (!PHOTO_TYPES.includes(file.type)) { setErrors((s) => ({ ...s, employees: 'Photo must be a JPEG, PNG or WebP image.' })); return }
    if (file.size > PHOTO_MAX_BYTES) { setErrors((s) => ({ ...s, employees: 'Photo must be 2 MB or smaller.' })); return }
    setBusy(`photo-${employee.id}`)
    try {
      await request(`${API.payroll}/api/employee-images/${employee.id}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      setNotice(`Photo updated for ${employee.fullName}.`); await loadPhotos()
    } catch (e) { setErrors((s) => ({ ...s, employees: e.message })) }
    finally { setBusy('') }
  }
  function closeDeleteDialog() { if (!busy.startsWith('delete-')) { setPendingDelete(null); setErrors((s) => ({ ...s, deleteDialog: '' })) } }
  async function runPayroll(event) {
    event.preventDefault(); setBusy('payroll'); setNotice(''); setLastRun(null); setErrors((s) => ({ ...s, payrollForm: '' }))
    try {
      const record = await request(`${API.payroll}/api/payroll/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: Number(payrollForm.employeeId), period: payrollForm.period, overtimeHours: Number(payrollForm.overtimeHours), deductions: Number(payrollForm.deductions) }) })
      setLastRun(record); setNotice(`Payroll run created for ${record.fullName}: ${money(record.netPay)} net pay.`); await loadRuns(); setAnalysis(null)
    } catch (e) { setErrors((s) => ({ ...s, payrollForm: e.message })) }
    finally { setBusy('') }
  }
  async function analyze() {
    setBusy('analysis'); setAnalysis(null); setErrors((s) => ({ ...s, analysis: '' }))
    try { setAnalysis(await request(`${API.analysis}/api/ai/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: runs }) })) }
    catch (e) { setErrors((s) => ({ ...s, analysis: e.message })) }
    finally { setBusy('') }
  }
  async function checkAws() {
    setBusy('aws'); setErrors((s) => ({ ...s, aws: '' }))
    try { setAws(await request(`${API.payroll}/api/aws/identity`)) }
    catch (e) { setErrors((s) => ({ ...s, aws: e.message })) }
    finally { setBusy('') }
  }
  function download(record) {
    const blob = new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `payroll-${record.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#top" aria-label="Payday home"><span className="brand-mark"><Icon kind="wallet"/></span><span>payday<span className="brand-dot">.</span></span></a><div className="workspace-label">WORKSPACE</div><nav className="side-nav" aria-label="Main navigation"><a className="nav-link active" href="#overview"><span className="nav-symbol">▦</span>Overview</a><a className="nav-link" href="#employees"><Icon kind="people" size={17}/>Employees</a><a className="nav-link" href="#payroll"><Icon kind="wallet" size={17}/>Payroll</a><a className="nav-link" href="#insights"><Icon kind="spark" size={17}/>Insights</a></nav><div className="sidebar-bottom"><div className="demo-card"><span className="live-dot"/><div><strong>Local demo</strong><small>Services run on your machine</small></div></div><div className="user-mini"><div className="avatar">{initials}</div><div className="user-text"><strong title={user?.emailAddress}>{user?.emailAddress}</strong><small>{isAdmin ? 'Administrator' : 'Member'}</small></div></div><button className="button button-quiet logout-button" onClick={onLogout}>Log out</button></div></aside>
    <main id="top" className="main-content"><header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div><div className="topbar-right"><span>Fictional payroll workspace</span><div className="avatar avatar-small">{initials}</div></div></header>
      <div className="page-wrap">
        <section id="overview" className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>PAYROLL WORKSPACE</div><h1>Good work starts <span>here.</span></h1><p className="subtitle">A clear view of your people and monthly payroll.</p></div><button className="button button-quiet refresh-button" onClick={() => { loadEmployees(); loadRuns(); loadPhotos() }}><Icon kind="refresh" size={16}/>Refresh data</button></section>
        <section className="metrics" aria-label="Payroll summary"><article className="metric-card"><div className="metric-top"><span className="metric-label">Team members</span><span className="metric-icon lilac"><Icon kind="people"/></span></div><div className="metric-value">{loading.employees ? '—' : employees.length}</div><div className="metric-foot">Fictional employee records</div></article><article className="metric-card"><div className="metric-top"><span className="metric-label">Payroll runs</span><span className="metric-icon peach"><Icon kind="wallet"/></span></div><div className="metric-value">{loading.runs ? '—' : runs.length}</div><div className="metric-foot">Saved to local workspace</div></article><article className="metric-card metric-highlight"><div className="metric-top"><span className="metric-label">Net pay processed</span><span className="metric-icon green"><Icon kind="arrow"/></span></div><div className="metric-value metric-money">{loading.runs ? '—' : money(totals.net)}</div><div className="metric-foot">Across all payroll runs</div></article></section>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
        {!isAdmin && <div className="member-note" role="status">You are signed in as a member: you can view employees, payroll history and ask the assistant. Adding employees and running payroll needs an administrator.</div>}
        {isAdmin && <section className="work-grid">
          <article id="employees" className="panel form-panel"><div className="panel-heading"><div><span className="section-kicker">PEOPLE</span><h2>Add an employee</h2></div><span className="heading-icon lilac"><Icon kind="people"/></span></div><p className="panel-intro">Add a fictional team member to your directory.</p><form onSubmit={addEmployee} className="form-stack" noValidate><label>Full name<input maxLength="160" placeholder="e.g. Dani Flores Jr." aria-invalid={!!fieldErrors.fullName} value={employeeForm.fullName} onChange={(e) => { setFieldErrors((f) => ({ ...f, fullName: '' })); setEmployeeForm({ ...employeeForm, fullName: e.target.value }) }}/>{fieldErrors.fullName && <span className="field-error" role="alert">{fieldErrors.fullName}</span>}</label><label>Position<select aria-invalid={!!fieldErrors.position} value={employeeForm.position} onChange={(e) => { setFieldErrors((f) => ({ ...f, position: '', baseSalary: '' })); setEmployeeForm({ ...employeeForm, position: e.target.value }) }}><option value="" disabled>Select a position</option><option value="Associate">Associate</option><option value="Senior Associate">Senior Associate</option><option value="Manager">Manager</option></select>{fieldErrors.position && <span className="field-error" role="alert">{fieldErrors.position}</span>}</label><label>Email address<input type="email" maxLength="254" title="Email must end in @pwc.com" placeholder="e.g. dani@pwc.com" aria-invalid={!!fieldErrors.emailAddress} value={employeeForm.emailAddress} onChange={(e) => { setFieldErrors((f) => ({ ...f, emailAddress: '' })); setEmployeeForm({ ...employeeForm, emailAddress: e.target.value }) }}/>{fieldErrors.emailAddress && <span className="field-error" role="alert">{fieldErrors.emailAddress}</span>}</label><label>Contact number<input type="tel" inputMode="tel" maxLength="13" title="Start with +63 followed by 10 digits" placeholder="+639171234567" aria-invalid={!!fieldErrors.contactNumber} value={employeeForm.contactNumber} onChange={(e) => { const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^63/, ''); setFieldErrors((f) => ({ ...f, contactNumber: '' })); setEmployeeForm({ ...employeeForm, contactNumber: '+63' + digits }) }}/>{fieldErrors.contactNumber && <span className="field-error" role="alert">{fieldErrors.contactNumber}</span>}</label><label>Monthly base salary<span className="input-prefix"><span>₱</span><input type="number" aria-invalid={!!fieldErrors.baseSalary} min={SALARY_RANGES[employeeForm.position]?.[0] ?? 0.01} max={SALARY_RANGES[employeeForm.position]?.[1] ?? undefined} step="0.01" title={employeeForm.position ? `Allowed for ${employeeForm.position}: ${SALARY_RANGES[employeeForm.position][0].toLocaleString()}${SALARY_RANGES[employeeForm.position][1] ? ` to ${SALARY_RANGES[employeeForm.position][1].toLocaleString()}` : ' and above'}` : 'Select a position first'} placeholder="30,000.00" value={employeeForm.baseSalary} onChange={(e) => { setFieldErrors((f) => ({ ...f, baseSalary: '' })); setEmployeeForm({ ...employeeForm, baseSalary: e.target.value }) }}/></span>{fieldErrors.baseSalary && <span className="field-error" role="alert">{fieldErrors.baseSalary}</span>}</label>{errors.employeeForm && <p className="error-message" role="alert">{errors.employeeForm}</p>}<button className="button button-dark full-button" disabled={busy === 'employee'}><Icon kind="plus" size={17}/>{busy === 'employee' ? 'Adding employee…' : 'Add employee'}</button></form></article>
          <article id="payroll" className="panel form-panel"><div className="panel-heading"><div><span className="section-kicker">MONTHLY PROCESSING</span><h2>Run payroll</h2></div><span className="heading-icon peach"><Icon kind="wallet"/></span></div><p className="panel-intro">Salary comes from the employee service.</p><form onSubmit={runPayroll} className="form-stack"><label>Employee<select required value={payrollForm.employeeId} onChange={(e) => setPayrollForm({ ...payrollForm, employeeId: e.target.value })}><option value="" disabled>Select an employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label><div className="form-row"><label>Pay period<input required type="month" value={payrollForm.period} onChange={(e) => setPayrollForm({ ...payrollForm, period: e.target.value })}/></label><label>Overtime hours<input required type="number" min="0" max="100" step="0.25" value={payrollForm.overtimeHours} onChange={(e) => setPayrollForm({ ...payrollForm, overtimeHours: e.target.value })}/></label></div><label>Other deductions (besides tax and contributions)<span className="input-prefix"><span>₱</span><input required type="number" min="0" step="0.01" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })}/></span></label>{errors.payrollForm && <p className="error-message" role="alert">{errors.payrollForm}</p>}<button className="button button-dark full-button" disabled={busy === 'payroll' || !employees.length}><Icon kind="arrow" size={17}/>{busy === 'payroll' ? 'Processing payroll…' : 'Calculate payroll'}</button></form>{lastRun && <div className="breakdown" aria-live="polite"><Payslip run={lastRun}/></div>}</article>
        </section>}
        <section id="insights" className="integration-row"><div className="integration-copy"><span className="integration-mark"><Icon kind="spark"/></span><div><h2>Thoughtful checks, locally run.</h2><p>Review payroll runs with fixed rules and an OpenAI check.</p></div></div><div className="integration-actions"><button className="button button-soft" onClick={analyze} disabled={busy === 'analysis' || loading.runs}><Icon kind="spark" size={16}/>{busy === 'analysis' ? 'Analyzing…' : 'Analyze payroll history'}</button>{isAdmin && <button className="button button-outline" onClick={checkAws} disabled={busy === 'aws'}><Icon kind="cloud" size={16}/>{busy === 'aws' ? 'Checking…' : 'AWS status'}</button>}</div></section>
        {errors.analysis && <div className="error-banner" role="alert">Analysis unavailable: {errors.analysis}</div>}{analysis && <section className="analysis-panel" aria-live="polite"><strong>Analysis complete</strong><p>{analysis.count} payroll {analysis.count === 1 ? 'record' : 'records'} reviewed. Results are educational, not fraud or legal findings.</p>{!analysis.ai_available && <p className="error-message" role="alert">OpenAI review was unavailable ({analysis.ai_error}), so only the fixed rules were applied.</p>}<div className="analysis-results">{analysis.results?.map((item, i) => <div className="analysis-item" key={item.id || i}><span className={`status-pill ${item.status}`}>{item.status}</span><span>{item.id || `Record ${i + 1}`}</span>{item.ai_reason && <span className={item.ai_flagged ? 'warning-tag' : 'ai-note'}>{item.ai_reason}</span>}{item.warnings?.map((warning) => <span className="warning-tag" key={warning}>{warning.replaceAll('_', ' ')}</span>)}</div>)}</div></section>}
        {errors.aws && <div className="error-banner" role="alert">AWS status unavailable: {errors.aws}</div>}{aws && <div className="aws-result" role="status"><span className="live-dot"/><div><strong>{aws.enabled ? 'AWS identity check enabled' : 'Offline mode active'}</strong><span>{aws.enabled ? `Masked identity: ${aws.account || 'account hidden'}${aws.arn ? ` · ${aws.arn}` : ''}` : 'No AWS calls were made. This status does not indicate an AWS login.'}</span></div></div>}
        <section className="panel table-panel"><div className="table-heading"><div><span className="section-kicker">DIRECTORY</span><h2>Employees</h2><p>Fictional records from the Java employee service.</p></div><span className="count-badge">{loading.employees ? '…' : `${employees.length} people`}</span></div>{errors.employees && <div className="inline-state error-message" role="alert">{errors.employees}</div>}{loading.employees ? <div className="inline-state">Loading employees…</div> : employees.length ? <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>EMPLOYEE CODE</th><th>POSITION</th><th>EMAIL</th><th>CONTACT</th><th>BASE SALARY</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{employees.map((e) => <tr key={e.id}><td><div className="person-cell"><span className="person-avatar">{photos[e.id] ? <img src={photos[e.id]} alt={`${e.fullName} photo`} onError={() => setPhotos((p) => { const rest = { ...p }; delete rest[e.id]; return rest })}/> : e.fullName?.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span><span className="person-name">{e.fullName}</span></div></td><td><span className="code-pill">{e.employeeCode}</span></td><td>{e.position}</td><td>{e.emailAddress}</td><td>{e.contactNumber}</td><td className="amount-cell">{money(e.baseSalary)}</td><td>{isAdmin && <div className="row-actions"><label className="download-button photo-button" title={photos[e.id] ? 'Change photo' : 'Upload photo'} aria-busy={busy === `photo-${e.id}`}><Icon kind="camera" size={16}/><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`${photos[e.id] ? 'Change' : 'Upload'} photo for ${e.fullName}`} disabled={busy === `photo-${e.id}`} onChange={(ev) => uploadPhoto(e, ev)}/></label><button className="download-button delete-button" onClick={() => { setErrors((s) => ({ ...s, deleteDialog: '' })); setPendingDelete(e) }} aria-label={`Delete ${e.fullName}`} title="Delete employee"><Icon kind="trash" size={16}/></button></div>}</td></tr>)}</tbody></table></div> : !errors.employees && <div className="inline-state">No employees yet. Add a fictional team member above.</div>}</section>
        <section className="panel table-panel history-panel"><div className="table-heading"><div><span className="section-kicker">PAY HISTORY</span><h2>Payroll history</h2><p>Saved payroll runs with downloadable JSON reports.</p></div><span className="count-badge">{loading.runs ? '…' : `${runs.length} runs`}</span></div>{errors.runs && <div className="inline-state error-message" role="alert">{errors.runs}</div>}{loading.runs ? <div className="inline-state">Loading payroll history…</div> : runs.length ? <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>PERIOD</th><th>GROSS PAY</th><th>DEDUCTIONS</th><th>NET PAY</th><th><span className="sr-only">Report</span></th></tr></thead><tbody>{[...runs].reverse().map((r) => <tr key={r.id}><td><div className="person-cell"><span className="person-avatar">{r.fullName?.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span><div><span className="person-name">{r.fullName}</span><small className="sub-cell">{r.employeeCode}</small></div></div></td><td>{r.period}</td><td className="amount-cell">{money(r.grossPay)}</td><td className="muted-cell">{money(r.deductions)}</td><td className="amount-cell net-cell">{money(r.netPay)}</td><td><div className="row-actions"><button className="download-button" onClick={() => setViewRun(r)} aria-label={`View payslip for ${r.fullName}, ${r.period}`} title="View payslip"><Icon kind="eye" size={16}/></button><button className="download-button" onClick={() => download(r)} aria-label={`Download JSON report for ${r.fullName}, ${r.period}`} title="Download JSON report"><Icon kind="download" size={16}/></button></div></td></tr>)}</tbody></table></div> : !errors.runs && <div className="empty-history"><span className="empty-mark"><Icon kind="wallet" size={21}/></span><strong>No payroll runs yet</strong><span>Your first processed payroll will show up here.</span></div>}</section>
        <footer className="footer"><span>Payday <b>·</b> Fictional payroll workspace</span><span>All amounts in Philippine pesos</span></footer>
      </div>
      {viewRun && <div className="modal-backdrop" onClick={() => setViewRun(null)}>
        <div className="modal payslip-modal" role="dialog" aria-modal="true" aria-label={`Payslip for ${viewRun.fullName}, ${viewRun.period}`} onClick={(e) => e.stopPropagation()}>
          <div className="breakdown payslip"><Payslip run={viewRun}/></div>
          <div className="modal-actions">
            <button className="button button-quiet" onClick={() => download(viewRun)}>Download</button>
            <button className="button button-dark" onClick={() => setViewRun(null)} autoFocus>Close</button>
          </div>
        </div>
      </div>}
      {pendingDelete && <div className="modal-backdrop" onClick={closeDeleteDialog}>
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-desc" onClick={(e) => e.stopPropagation()}>
          <h2 id="delete-title">Delete employee?</h2>
          <p id="delete-desc"><strong>{pendingDelete.fullName}</strong> ({pendingDelete.employeeCode}) will be removed from the employee directory. This cannot be undone.</p>
          {errors.deleteDialog && <p className="error-message" role="alert">{errors.deleteDialog}</p>}
          <div className="modal-actions">
            <button className="button button-quiet" onClick={closeDeleteDialog} disabled={busy === `delete-${pendingDelete.id}`} autoFocus>Cancel</button>
            <button className="button button-danger" onClick={() => deleteEmployee(pendingDelete)} disabled={busy === `delete-${pendingDelete.id}`}>{busy === `delete-${pendingDelete.id}` ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </div>}
    </main>
  </div>
}

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@pwc\.com$/i

function validateCredentials(mode, form) {
  const problems = {}
  const email = form.emailAddress.trim()
  if (!email) problems.emailAddress = 'emailAddress is required'
  else if (mode !== 'login' && !EMAIL_PATTERN.test(email)) problems.emailAddress = 'emailAddress must be a valid address ending in @pwc.com'
  if (mode === 'login') {
    if (!form.password) problems.password = 'password is required'
  } else if (mode === 'signup') {
    if (!form.password) problems.password = 'password is required'
    else if (form.password.length < 8) problems.password = 'password must be 8 to 100 characters'
    if (form.password !== form.confirm) problems.confirm = 'Passwords do not match'
  }
  return problems
}

const AUTH_TITLES = {
  login: ['Sign in', 'Sign in to your payroll workspace.'],
  signup: ['Create account', 'Use your @pwc.com e-mail. New accounts are members; an admin can run payroll.']
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ emailAddress: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function go(next) { setMode(next); setFieldErrors({}); setError(''); setForm((f) => ({ ...f, password: '', confirm: '' })) }
  function change(field, value) { setError(''); setFieldErrors((f) => ({ ...f, [field]: '' })); setForm((f) => ({ ...f, [field]: value })) }

  async function submit(event) {
    event.preventDefault(); setError('')
    const problems = validateCredentials(mode, form)
    setFieldErrors(problems)
    if (Object.keys(problems).length) return
    const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const email = form.emailAddress.trim()
    setBusy(true)
    try {
      const path = mode === 'login' ? 'login' : 'signup'
      const result = await request(`${API.employees}/api/auth/${path}`, json({ emailAddress: email, password: form.password }))
      onLogin(result)
    } catch (e) {
      if (e.fieldErrors && Object.keys(e.fieldErrors).length) setFieldErrors(e.fieldErrors)
      else setError(e.message)
      setForm((f) => ({ ...f, password: '', confirm: '' }))
    } finally { setBusy(false) }
  }

  const [title, intro] = AUTH_TITLES[mode]
  const fieldError = (name) => fieldErrors[name] && <span className="field-error" role="alert">{fieldErrors[name]}</span>
  return <main className="login-page">
    <form className="login-card" onSubmit={submit} noValidate>
      <div className="brand login-brand"><span className="brand-mark"><Icon kind="wallet"/></span><span>payday<span className="brand-dot">.</span></span></div>
      <h1>{title}</h1>
      <p className="login-intro">{intro}</p>
      <div className="form-stack">
        <label>E-mail address<input autoFocus type="email" autoComplete="username" placeholder="name@pwc.com" value={form.emailAddress} onChange={(e) => change('emailAddress', e.target.value)} aria-invalid={!!fieldErrors.emailAddress}/>{fieldError('emailAddress')}</label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => change('password', e.target.value)} aria-invalid={!!fieldErrors.password}/>{fieldError('password')}</label>
        {mode === 'signup' && <label>Confirm password<input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => change('confirm', e.target.value)} aria-invalid={!!fieldErrors.confirm}/>{fieldError('confirm')}</label>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="button button-dark full-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : { login: 'Sign in', signup: 'Create account' }[mode]}</button>
      </div>
      <div className="login-links">
        {mode === 'login' && <button type="button" className="link-button" onClick={() => go('signup')}>Sign up</button>}
        {mode === 'signup' && <button type="button" className="link-button" onClick={() => go('login')}>Back to sign in</button>}
      </div>
    </form>
  </main>
}

function Root() {
  const [session, setSession] = useState(readSession)
  // A JWT is not stored on the server, so signing out just forgets it here. It stays valid until it expires.
  const logout = useCallback(() => { sessionStorage.removeItem(SESSION_KEY); setSession(null) }, [])
  const login = (result) => { sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); setSession(result) }

  useEffect(() => {
    onSessionExpired = () => { sessionStorage.removeItem(SESSION_KEY); setSession(null) }
    return () => { onSessionExpired = () => {} }
  }, [])
  useEffect(() => {
    if (!session) return
    const wait = Math.max(0, session.expiresAt - Date.now())
    const timer = setTimeout(() => { sessionStorage.removeItem(SESSION_KEY); setSession(null) }, Math.min(wait, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [session])

  return session ? <><App user={session.user} onLogout={logout}/><ChatWidget/></> : <Login onLogin={login}/>
}

export default Root
