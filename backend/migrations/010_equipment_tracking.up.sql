-- 010_equipment_tracking.up.sql
-- 硬件运行参数追踪：钙反当前状态、滴定泵通道、调参日志

-- 钙反当前状态（每缸 1 行，UPSERT 更新）
CREATE TABLE calcium_reactor_states (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id     UUID        NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  flow_rate   NUMERIC(6,2),          -- 出水流速 ml/min（可空，表示未设置）
  target_ph   NUMERIC(4,2),          -- 内部目标 pH
  outlet_kh   NUMERIC(5,1),          -- 出水 KH dKH
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tank_id)
);

-- 滴定泵通道（每通道 1 行，UPSERT 更新）
CREATE TABLE dosing_pump_channels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id       UUID        NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  channel_name  VARCHAR(64) NOT NULL,
  daily_dose_g  NUMERIC(7,2) NOT NULL DEFAULT 0,  -- 每日滴定量 g/day
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tank_id, channel_name)
);

-- 调参历史日志（只追加，不可修改）
CREATE TABLE equipment_tuning_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id     UUID        NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  device_type VARCHAR(32) NOT NULL,   -- 'calcium_reactor' | 'dosing_pump'
  param_name  VARCHAR(64) NOT NULL,   -- 字段名，如 'flow_rate' / 'Ca补充'
  old_value   TEXT,                   -- 调前值（字符串，首次设置时为 NULL）
  new_value   TEXT        NOT NULL,   -- 调后值
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_etl_tank_changed ON equipment_tuning_logs(tank_id, changed_at DESC);
