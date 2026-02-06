---
title: PGlite 遷移 - 脫離 Render 後端
type: refactor
status: completed
created: 2026-02-06
---

# PGlite 遷移 - 脫離 Render 後端

## 背景

目前 smai-recruit-test 的管理後台依賴 smai-mcp-center (Render) 提供 recruit API 和 SSO 認證。
Render 服務已 suspended，管理後台無法使用。
遷移到 PGlite 後，管理後台可完全離線運作，不花錢。

## 變更內容

將管理後台 (kanri.html) 的資料存取從 Render API 改為瀏覽器內嵌 PGlite (IndexedDB 持久化)。
考試前端 (index.html) 的 Claude 出題功能維持 Vercel Serverless 不變。

### API 遷移對照

| API | 現狀 | 遷移後 |
|-----|------|--------|
| GET /recruit/results | Render API | PGlite SELECT |
| GET /recruit/results/:id | Render API | PGlite SELECT WHERE |
| GET /recruit/audit-logs | Render API | PGlite SELECT |
| PATCH /recruit/results/:id/review | Render API | PGlite UPDATE |
| POST /recruit/submit | Render API | PGlite INSERT |
| POST /api/generate-question | Vercel Serverless | 不變 (需 Claude API key) |
| POST /api/ai-insight | Vercel Serverless | 可移到前端 (純邏輯) |
| POST /sso/pin/login | Render SSO | 改為本地 PIN 驗證 (PGlite) |
| POST /sso/pin/verify | Render SSO | 改為本地 token 驗證 |

### 資料表設計

```sql
-- 1. 測驗結果 (從 smai-mcp-center 的 recruit_tests 簡化)
CREATE TABLE recruit_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position TEXT NOT NULL,
  choice_score INTEGER NOT NULL DEFAULT 0,
  total_choice INTEGER NOT NULL DEFAULT 0,
  personality_analysis TEXT, -- JSON
  avg_response_time REAL,
  answer_change_count INTEGER,
  behavior_pattern TEXT,
  answers TEXT NOT NULL,        -- JSON array
  challenge_answers TEXT,       -- JSON array
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

-- 2. 稽核日誌
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 本地管理員 (取代 SSO)
CREATE TABLE local_admins (
  id TEXT PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 新增檔案

```
src/
├── db/
│   ├── client.js          # PGlite 初始化 (idb://smai-recruit)
│   ├── schema.sql         # CREATE TABLE 語句
│   ├── seed.js            # 範例資料 (3-5 筆測驗結果)
│   └── migrate.js         # 首次載入時執行 schema + seed
├── services/
│   └── recruit-local.js   # 本地 CRUD (取代 API 呼叫)
└── auth/
    └── local-auth.js      # 本地 PIN 認證 (取代 SSO)
```

## 影響範圍

- `index.html` - 考試提交改寫入 PGlite
- `kanri.html` - 管理後台改用本地查詢
- `api/ai-insight.js` - 可選：移到前端
- `api/generate-question.js` - 不變
- 新增 `src/db/` 目錄

## 認證方案

SSO 依賴外部服務，改為本地 PIN 驗證：
- 管理員帳號存在 PGlite (local_admins 表)
- PIN 用 bcrypt hash (引入 bcryptjs)
- JWT token 用 jose 產生，存 localStorage
- seed data 預設一個管理員帳號

## 測試計畫

1. 考試流程：填寫資料 → Claude 出題 → 作答 → 提交 → PGlite 寫入成功
2. 管理後台：PIN 登入 → 查看結果列表 → 查看詳情 → 審核通過/拒絕
3. 離線測試：斷網後管理後台仍可查詢、審核
4. 資料持久化：重整頁面後資料仍在 (IndexedDB)
5. 首次載入：schema 建立 + seed data 正確

## Checklist

- [x] PGlite CDN 載入 (cdn.jsdelivr.net)
- [x] 建立 src/db/recruit-db.js (整合 schema + seed + CRUD + auth)
- [x] 改寫 index.html 的提交邏輯 (dynamic import)
- [x] 改寫 kanri.html 的所有 API 呼叫 (ES module import)
- [x] 移除對 smai-mcp-center 的依賴
- [ ] E2E 測試 (待 Vercel 部署完成)
