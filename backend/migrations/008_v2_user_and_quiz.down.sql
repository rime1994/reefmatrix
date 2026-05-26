-- Migration 008 rollback

DROP TABLE IF EXISTS quiz_sessions;
DROP TABLE IF EXISTS reef_questions;

ALTER TABLE users
    DROP COLUMN IF EXISTS theme,
    DROP COLUMN IF EXISTS temp_unit,
    DROP COLUMN IF EXISTS salinity_unit,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS registration_path,
    DROP COLUMN IF EXISTS invited_by,
    DROP COLUMN IF EXISTS my_invite_code,
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS email;

ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
