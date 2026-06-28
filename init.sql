CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    expression TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
-- Добавляем колонку для ID клиента, если её еще нет
ALTER TABLE history ADD COLUMN IF NOT EXISTS client_id TEXT;

-- 1. Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

-- 2. Связываем историю с пользователем
-- Важно: мы не удаляем старую историю, просто добавляем колонку
ALTER TABLE history ADD COLUMN user_id INTEGER REFERENCES users(id);