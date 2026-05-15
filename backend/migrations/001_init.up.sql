-- ReefMatrix 初始化数据库 Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用户表（手机号为主键标识，预留微信 openid）
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone         VARCHAR(20)  UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    wechat_openid VARCHAR(100) UNIQUE,
    nickname      VARCHAR(100) NOT NULL DEFAULT '',
    avatar_url    VARCHAR(500),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 鱼缸表
CREATE TABLE tanks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    volume_liters DECIMAL(10,2) NOT NULL,
    setup_date   DATE,
    description  TEXT,
    status       VARCHAR(20)  NOT NULL DEFAULT 'active', -- active | archived
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tanks_user_id ON tanks(user_id);

-- 水质记录（每次手动录入）
CREATE TABLE water_parameters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id     UUID         NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    salinity    DECIMAL(5,3),   -- ppt（比重 1.025 ≈ 33.9 ppt）
    temperature DECIMAL(4,1),   -- °C
    kh          DECIMAL(5,2),   -- dKH
    ca          INTEGER,        -- ppm
    mg          INTEGER,        -- ppm
    no3         DECIMAL(6,2),   -- ppm
    po4         DECIMAL(6,4),   -- ppm
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_water_parameters_tank_id ON water_parameters(tank_id);
CREATE INDEX idx_water_parameters_recorded_at ON water_parameters(recorded_at DESC);

-- 添加剂/药品定义（用户可自定义配置）
CREATE TABLE additives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    brand           VARCHAR(100),
    -- 作用元素: kh | ca | mg | no3 | po4 | other
    element         VARCHAR(20)  NOT NULL,
    -- 每 dose_unit 剂量在 100L 水中提升目标元素多少单位
    -- 例：NaHCO3 粉 1g 使 100L 水 KH 升高 ~0.595 dKH → dose_per_unit=0.595
    dose_per_unit   DECIMAL(12,6) NOT NULL,
    dose_unit       VARCHAR(10)  NOT NULL DEFAULT 'ml', -- ml | g
    concentration   DECIMAL(10,4),  -- 液体添加剂浓度（%），粉剂可不填
    notes           TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_additives_user_id ON additives(user_id);

-- 操作日志（换水、添加剂、清洁、检测等）
CREATE TABLE operations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id      UUID         NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    additive_id  UUID         REFERENCES additives(id) ON DELETE SET NULL,
    -- water_change | additive | clean | test | feed | other
    type         VARCHAR(30)  NOT NULL,
    amount       DECIMAL(10,3),
    unit         VARCHAR(10),
    recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    notes        TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_operations_tank_id ON operations(tank_id);
CREATE INDEX idx_operations_recorded_at ON operations(recorded_at DESC);

-- 资产清单（生物 + 设备）
CREATE TABLE assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id        UUID         NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    -- fish | coral | invertebrate | equipment | other
    category       VARCHAR(30)  NOT NULL,
    name           VARCHAR(200) NOT NULL,
    species        VARCHAR(200),
    quantity       INTEGER      NOT NULL DEFAULT 1,
    purchase_price DECIMAL(10,2),
    current_value  DECIMAL(10,2),
    purchase_date  DATE,
    -- healthy | sick | sold | dead | transferred
    status         VARCHAR(20)  NOT NULL DEFAULT 'healthy',
    notes          TEXT,
    image_url      VARCHAR(500),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_assets_tank_id ON assets(tank_id);

-- 提醒任务
CREATE TABLE reminders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tank_id        UUID         REFERENCES tanks(id) ON DELETE CASCADE,
    title          VARCHAR(200) NOT NULL,
    description    TEXT,
    is_recurring   BOOLEAN      NOT NULL DEFAULT FALSE,
    cron_expr      VARCHAR(100),    -- 周期任务：cron 表达式
    remind_at      TIMESTAMPTZ,     -- 单次任务：具体时间
    next_remind_at TIMESTAMPTZ,     -- 下次提醒时间（后端维护）
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_next_remind_at ON reminders(next_remind_at);

-- 参数安全范围配置（用户可按缸自定义）
CREATE TABLE parameter_ranges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id     UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    parameter   VARCHAR(20) NOT NULL,  -- salinity|temperature|kh|ca|mg|no3|po4
    min_value   DECIMAL(12,4),
    max_value   DECIMAL(12,4),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tank_id, parameter)
);
