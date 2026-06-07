CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    expression TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
-- Добавляем колонку для ID клиента, если её еще нет
ALTER TABLE history ADD COLUMN IF NOT EXISTS client_id TEXT;