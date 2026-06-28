-- Simple migration for demo
-- Run: psql $DATABASE_URL -f db/init.sql   (or use pgAdmin)

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  report_count INT DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  doc_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id BIGINT,
  user_name TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id BIGSERIAL PRIMARY KEY,
  doc_id BIGINT NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  handled BOOLEAN DEFAULT FALSE
);

-- Seed sample documents
INSERT INTO documents (title, content)
SELECT t.title, t.content
FROM (VALUES
  ('Tài liệu A','Nội dung A'),
  ('Tài liệu B','Nội dung B'),
  ('Tài liệu C','Nội dung C')
) AS t(title, content)
WHERE NOT EXISTS (SELECT 1 FROM documents WHERE title = t.title);
