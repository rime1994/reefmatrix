CREATE TABLE IF NOT EXISTS prompt_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_message TEXT NOT NULL,
    instructions   TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
