DROP TABLE IF EXISTS bio_measurements;
DROP TABLE IF EXISTS equipment_logs;
ALTER TABLE assets DROP COLUMN IF EXISTS equipment_type;
