-- MySQL migration for demo
-- Run: mysql -u <user> -p < db/init.sql   (or use MySQL Workbench)

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  report_count INT DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_id BIGINT NOT NULL,
  user_id BIGINT,
  user_name TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_id BIGINT NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  handled BOOLEAN DEFAULT FALSE
);

-- Seed sample documents if they don't exist
INSERT INTO documents (title, content)
SELECT 'Tài liệu A','Nội dung A' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM documents WHERE title = 'Tài liệu A');

INSERT INTO documents (title, content)
SELECT 'Tài liệu B','Nội dung B' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM documents WHERE title = 'Tài liệu B');

INSERT INTO documents (title, content)
SELECT 'Tài liệu C','Nội dung C' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM documents WHERE title = 'Tài liệu C');
