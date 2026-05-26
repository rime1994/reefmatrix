-- 011_dosing_times_per_day.down.sql
ALTER TABLE dosing_pump_channels
  DROP COLUMN IF EXISTS dose_g_per_time,
  DROP COLUMN IF EXISTS times_per_day;
