-- Migration 008: 大版本迭代 Schema — 用户体系 v2 + 知识问答防刷机制
-- 对应 NOTES.md v2 第 4 节

-- ── 1. users 表扩展 ────────────────────────────────────────────────────────

-- 主要登录标识改为邮箱（phone 保留可空，存量用户迁移期使用）
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email             VARCHAR(255) UNIQUE,
    ADD COLUMN IF NOT EXISTS username          VARCHAR(50)  UNIQUE,
    ADD COLUMN IF NOT EXISTS my_invite_code    VARCHAR(20)  UNIQUE,  -- 注册时自动生成，格式 RM-XXXXXX
    ADD COLUMN IF NOT EXISTS invited_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS registration_path VARCHAR(20)  NOT NULL DEFAULT 'quiz',  -- wechat | invite | quiz
    ADD COLUMN IF NOT EXISTS timezone          VARCHAR(50)  NOT NULL DEFAULT 'Asia/Shanghai',
    ADD COLUMN IF NOT EXISTS salinity_unit     VARCHAR(10)  NOT NULL DEFAULT 'ppt',   -- ppt | sg
    ADD COLUMN IF NOT EXISTS temp_unit         VARCHAR(5)   NOT NULL DEFAULT 'C',     -- C | F
    ADD COLUMN IF NOT EXISTS theme             VARCHAR(10)  NOT NULL DEFAULT 'system'; -- light | dark | system

CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_my_invite_code ON users(my_invite_code);

-- ── 2. reef_questions 表（知识问答题库）────────────────────────────────────

CREATE TABLE IF NOT EXISTS reef_questions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question    TEXT        NOT NULL,
    options     JSONB       NOT NULL,         -- ["选项A内容", "选项B内容", "选项C内容", "选项D内容"]
    answer      CHAR(1)     NOT NULL          -- 'A' | 'B' | 'C' | 'D'
                CHECK (answer IN ('A','B','C','D')),
    explanation TEXT,                         -- 答错后展示的知识解析（≤100字）
    difficulty  VARCHAR(10) NOT NULL DEFAULT 'medium'
                CHECK (difficulty IN ('easy','medium','hard')),
    category    VARCHAR(30)                   -- chemistry | biology | equipment | husbandry
                CHECK (category IN ('chemistry','biology','equipment','husbandry')),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. quiz_sessions 表（答题防刷机制）────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash      VARCHAR(64) NOT NULL,              -- SHA-256(IP)，不存原始 IP
    question_id  UUID        REFERENCES reef_questions(id) ON DELETE SET NULL,
    answer_given CHAR(1),
    passed       BOOLEAN     NOT NULL DEFAULT FALSE,
    quiz_token   VARCHAR(64) UNIQUE,                -- 答对后下发，注册时一次性消费
    token_used   BOOLEAN     NOT NULL DEFAULT FALSE,
    expires_at   TIMESTAMPTZ,                       -- quiz_token 有效期（答对后 NOW()+30min）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 防刷限流查询索引：WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_ip_hour ON quiz_sessions(ip_hash, created_at);
-- quiz_token 快速查验
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_token   ON quiz_sessions(quiz_token) WHERE quiz_token IS NOT NULL;
