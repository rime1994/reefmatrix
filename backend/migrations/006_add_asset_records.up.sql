-- assets 表新增设备类型字段
ALTER TABLE assets ADD COLUMN IF NOT EXISTS equipment_type VARCHAR(30);

-- 设备运行参数记录（每种设备参数不同，用 JSONB 存储）
CREATE TABLE IF NOT EXISTS equipment_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    params      JSONB NOT NULL DEFAULT '{}',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_asset_id ON equipment_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_recorded_at ON equipment_logs(recorded_at DESC);

-- 生物尺寸/体重记录
CREATE TABLE IF NOT EXISTS bio_measurements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    size_cm     DECIMAL(6,2),
    weight_g    DECIMAL(8,2),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bio_measurements_asset_id ON bio_measurements(asset_id);
