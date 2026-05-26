-- 011_dosing_times_per_day.up.sql
-- 滴定泵通道新增：每次剂量（g/次）和每日次数，替换原 daily_dose_g 的语义
-- daily_dose_g 保留为派生字段（dose_g_per_time × times_per_day），由应用层维护

ALTER TABLE dosing_pump_channels
  ADD COLUMN IF NOT EXISTS dose_g_per_time NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_per_day   SMALLINT     NOT NULL DEFAULT 1;

-- 将存量 daily_dose_g 反推为 dose_g_per_time（假设原来 times_per_day=1）
UPDATE dosing_pump_channels SET dose_g_per_time = daily_dose_g WHERE dose_g_per_time = 0;
