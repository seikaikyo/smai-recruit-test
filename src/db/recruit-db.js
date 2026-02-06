// PGlite 本地資料庫服務
// 取代 smai-mcp-center (Render) 後端 API
// 所有資料存在瀏覽器 IndexedDB，無需後端伺服器

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js'

let db = null
let initPromise = null

// ---- Schema ----

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recruit_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position TEXT NOT NULL,
  choice_score INTEGER NOT NULL DEFAULT 0,
  total_choice INTEGER NOT NULL DEFAULT 0,
  personality_analysis TEXT,
  avg_response_time REAL,
  answer_change_count INTEGER,
  behavior_pattern TEXT,
  answers TEXT NOT NULL,
  challenge_answers TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  ip_address TEXT DEFAULT 'local',
  description TEXT,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_admins (
  id TEXT PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

// ---- Utilities ----

function generateId() {
  return crypto.randomUUID()
}

async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(`smai-recruit-salt:${pin}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatResult(row) {
  return {
    ...row,
    personality_analysis: typeof row.personality_analysis === 'string'
      ? JSON.parse(row.personality_analysis) : row.personality_analysis,
    answers: typeof row.answers === 'string'
      ? JSON.parse(row.answers) : (row.answers || []),
    challenge_answers: typeof row.challenge_answers === 'string'
      ? JSON.parse(row.challenge_answers) : (row.challenge_answers || []),
    created_at: formatTimestamp(row.created_at),
    reviewed_at: formatTimestamp(row.reviewed_at)
  }
}

// ---- Seed Data ----

async function seedData() {
  const adminPin = await hashPin('123456')

  // 預設管理員
  await db.query(
    `INSERT INTO local_admins (id, employee_id, name, pin_hash) VALUES ($1, $2, $3, $4)`,
    [generateId(), 'admin', 'SMAI 管理員', adminPin]
  )

  // 擬真測驗結果 (5 筆)
  const seeds = [
    {
      name: '王小明', email: 'wang@example.com', phone: '0912345678',
      position: 'Vue 前端工程師', choice_score: 9, total_choice: 12,
      avg_response_time: 18.5, answer_change_count: 2, behavior_pattern: 'expert',
      status: 'passed', reviewer_notes: '技術能力優秀，推薦錄用',
      personality: {
        leadership: { label: '領導力', score: 2, total: 3, percentage: 67 },
        communication: { label: '溝通力', score: 3, total: 3, percentage: 100 },
        analytical: { label: '分析力', score: 3, total: 3, percentage: 100 },
        resilience: { label: '抗壓力', score: 2, total: 3, percentage: 67 }
      },
      days_ago: 14
    },
    {
      name: '李大華', email: 'lee@example.com', phone: '0923456789',
      position: 'Fullstack 全端工程師', choice_score: 7, total_choice: 12,
      avg_response_time: 25.3, answer_change_count: 5, behavior_pattern: 'careful',
      status: 'reviewed', reviewer_notes: '基礎尚可，需加強後端',
      personality: {
        leadership: { label: '領導力', score: 1, total: 3, percentage: 33 },
        communication: { label: '溝通力', score: 2, total: 3, percentage: 67 },
        analytical: { label: '分析力', score: 2, total: 3, percentage: 67 },
        resilience: { label: '抗壓力', score: 3, total: 3, percentage: 100 }
      },
      days_ago: 10
    },
    {
      name: '張美麗', email: 'chang@example.com', phone: '0934567890',
      position: 'Python 後端工程師', choice_score: 11, total_choice: 12,
      avg_response_time: 15.2, answer_change_count: 1, behavior_pattern: 'expert',
      status: 'passed', reviewer_notes: '極優秀，即刻錄用',
      personality: {
        leadership: { label: '領導力', score: 3, total: 3, percentage: 100 },
        communication: { label: '溝通力', score: 2, total: 3, percentage: 67 },
        analytical: { label: '分析力', score: 3, total: 3, percentage: 100 },
        resilience: { label: '抗壓力', score: 3, total: 3, percentage: 100 }
      },
      days_ago: 7
    },
    {
      name: '陳建志', email: 'chen@example.com', phone: '0945678901',
      position: 'AI 應用工程師', choice_score: 6, total_choice: 12,
      avg_response_time: 35.7, answer_change_count: 8, behavior_pattern: 'hesitant',
      status: 'rejected', reviewer_notes: '基礎知識不足',
      personality: {
        leadership: { label: '領導力', score: 1, total: 3, percentage: 33 },
        communication: { label: '溝通力', score: 1, total: 3, percentage: 33 },
        analytical: { label: '分析力', score: 2, total: 3, percentage: 67 },
        resilience: { label: '抗壓力', score: 1, total: 3, percentage: 33 }
      },
      days_ago: 5
    },
    {
      name: '林雅婷', email: 'lin@example.com', phone: '0956789012',
      position: 'Vue 前端工程師', choice_score: 8, total_choice: 12,
      avg_response_time: 22.1, answer_change_count: 3, behavior_pattern: 'careful',
      status: 'pending', reviewer_notes: '',
      personality: {
        leadership: { label: '領導力', score: 2, total: 3, percentage: 67 },
        communication: { label: '溝通力', score: 3, total: 3, percentage: 100 },
        analytical: { label: '分析力', score: 2, total: 3, percentage: 67 },
        resilience: { label: '抗壓力', score: 2, total: 3, percentage: 67 }
      },
      days_ago: 1
    }
  ]

  for (const s of seeds) {
    const createdAt = new Date(Date.now() - s.days_ago * 86400000).toISOString()
    const reviewedAt = s.status !== 'pending'
      ? new Date(Date.now() - (s.days_ago - 1) * 86400000).toISOString() : null

    const answers = generateSeedAnswers(s.position, s.choice_score, s.total_choice)
    const challengeAnswers = generateSeedChallenges(s.position)

    await db.query(
      `INSERT INTO recruit_tests
        (id, name, email, phone, position, choice_score, total_choice,
         personality_analysis, avg_response_time, answer_change_count,
         behavior_pattern, answers, challenge_answers, status,
         reviewer_notes, created_at, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        generateId(), s.name, s.email, s.phone, s.position,
        s.choice_score, s.total_choice, JSON.stringify(s.personality),
        s.avg_response_time, s.answer_change_count, s.behavior_pattern,
        JSON.stringify(answers), JSON.stringify(challengeAnswers),
        s.status, s.reviewer_notes, createdAt, reviewedAt
      ]
    )
  }

  await db.query(
    `INSERT INTO audit_logs (id, action, description, created_at) VALUES ($1, $2, $3, $4)`,
    [generateId(), 'system', '系統初始化完成，載入 5 筆測驗資料', new Date().toISOString()]
  )
}

function generateSeedAnswers(position, correctCount, total) {
  const questions = [
    { q: 'Vue 3 Composition API 中，ref 和 reactive 的主要差異是什麼？', type: 'choice', cat: 'Vue 3' },
    { q: '下列哪個不是 Vue 3 的生命週期 Hook？', type: 'choice', cat: 'Vue 3' },
    { q: 'Tailwind CSS 的核心設計理念是什麼？', type: 'choice', cat: 'CSS' },
    { q: 'RESTful API 中，PUT 和 PATCH 的差異是？', type: 'choice', cat: 'API' },
    { q: 'Git rebase 和 merge 的主要區別是什麼？', type: 'choice', cat: 'Git' },
    { q: '什麼是 CORS？如何解決跨域問題？', type: 'choice', cat: '網路' },
    { q: 'JavaScript 中 Promise 和 async/await 的關係是？', type: 'choice', cat: 'JavaScript' },
    { q: '什麼是 XSS 攻擊？如何防禦？', type: 'choice', cat: '資安' },
    { q: 'CSS Flexbox 和 Grid 各適合什麼場景？', type: 'choice', cat: 'CSS' },
    { q: 'HTTP 狀態碼 401 和 403 的差異是？', type: 'choice', cat: '網路' },
    { q: '請說明你對元件化開發的理解', type: 'choice', cat: '架構' },
    { q: '如何優化前端效能？列舉三種方法', type: 'choice', cat: '效能' }
  ]

  const traits = ['leadership', 'communication', 'analytical', 'resilience']
  const answers = []

  for (let i = 0; i < total; i++) {
    const isCorrect = i < correctCount
    const qData = questions[i % questions.length]
    answers.push({
      question: qData.q,
      type: qData.type,
      category: qData.cat,
      answer: isCorrect ? '正確選項 (模擬)' : '錯誤選項 (模擬)',
      correct: isCorrect,
      trait: traits[i % traits.length]
    })
  }
  return answers
}

function generateSeedChallenges(position) {
  return [
    {
      question: `請設計一個適用於${position}的技術方案，說明你的思考過程`,
      category: '進階挑戰',
      answer: '(模擬回答) 我會先分析需求，然後選擇合適的技術架構...'
    },
    {
      question: `如果遇到團隊成員意見分歧，你會如何處理？`,
      category: '進階挑戰',
      answer: '(模擬回答) 我會先聆聽各方意見，尋找共識...'
    }
  ]
}

// ---- Database Initialization ----

export async function initDB() {
  if (db) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    db = new PGlite('idb://smai-recruit')
    await db.exec(SCHEMA)

    const result = await db.query('SELECT COUNT(*) as count FROM local_admins')
    if (parseInt(result.rows[0].count) === 0) {
      await seedData()
    }
  })()

  return initPromise
}

// ---- Authentication ----

export async function loginWithPin(employeeId, pin) {
  await initDB()
  const hash = await hashPin(pin)
  const result = await db.query(
    'SELECT * FROM local_admins WHERE employee_id = $1 AND pin_hash = $2',
    [employeeId, hash]
  )

  if (result.rows.length === 0) {
    return { success: false, message: '員工編號或 PIN 碼錯誤' }
  }

  const admin = result.rows[0]
  const token = generateId()

  await db.query(
    `INSERT INTO audit_logs (id, action, user_id, user_email, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [generateId(), 'login', admin.id, admin.employee_id, `${admin.name} 登入系統`]
  )

  return {
    success: true,
    data: {
      token,
      user: { name: admin.name, employee_id: admin.employee_id }
    }
  }
}

export function verifySession() {
  const token = localStorage.getItem('sso_token')
  const user = localStorage.getItem('sso_user')
  return !!(token && user)
}

// ---- Results CRUD ----

export async function getResults() {
  await initDB()
  const result = await db.query('SELECT * FROM recruit_tests ORDER BY created_at DESC')
  return { success: true, data: result.rows.map(formatResult) }
}

export async function getResultById(id) {
  await initDB()
  const result = await db.query('SELECT * FROM recruit_tests WHERE id = $1', [id])
  if (result.rows.length === 0) {
    return { success: false, message: '找不到結果' }
  }
  return { success: true, data: formatResult(result.rows[0]) }
}

export async function submitTest(data) {
  await initDB()
  const id = generateId()

  await db.query(
    `INSERT INTO recruit_tests
      (id, name, email, phone, position, choice_score, total_choice,
       personality_analysis, avg_response_time, answer_change_count,
       behavior_pattern, answers, challenge_answers)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, data.name, data.email || '', data.phone || null,
      data.position, data.choice_score, data.total_choice,
      JSON.stringify(data.personality_analysis),
      data.avg_response_time, data.answer_change_count,
      data.behavior_pattern,
      JSON.stringify(data.answers),
      JSON.stringify(data.challenge_answers)
    ]
  )

  await db.query(
    `INSERT INTO audit_logs (id, action, description) VALUES ($1, $2, $3)`,
    [generateId(), 'submit', `${data.name} 提交 ${data.position} 測驗`]
  )

  return { success: true, data: { id } }
}

export async function updateReview(id, status, reviewerNotes) {
  await initDB()

  await db.query(
    `UPDATE recruit_tests SET status = $1, reviewer_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [status, reviewerNotes, id]
  )

  const user = JSON.parse(localStorage.getItem('sso_user') || '{}')
  const statusLabel = { passed: '通過', rejected: '不通過', reviewed: '已審核' }

  await db.query(
    `INSERT INTO audit_logs (id, action, user_email, description) VALUES ($1, $2, $3, $4)`,
    [generateId(), 'review', user.employee_id || 'unknown',
     `審核 ${id.substring(0, 8)}... → ${statusLabel[status] || status}`]
  )

  return { success: true }
}

// ---- Audit Logs ----

export async function getAuditLogs() {
  await initDB()
  const result = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC')
  return {
    success: true,
    data: result.rows.map(row => ({
      ...row,
      created_at: formatTimestamp(row.created_at)
    }))
  }
}
