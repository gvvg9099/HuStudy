-- HuStudy Database Schema & Seed Data
-- Run: mysql -u root -p < server/seed.sql

CREATE DATABASE IF NOT EXISTS hustudy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hustudy;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- RESET (safe re-run)
-- ──────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ──────────────────────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)    NOT NULL,
  email         VARCHAR(200)    NOT NULL UNIQUE,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('STUDENT','ADMIN') NOT NULL DEFAULT 'STUDENT',
  avatar        VARCHAR(500)    NULL,
  banned        TINYINT(1)      NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  icon       VARCHAR(20)  NULL,
  color      VARCHAR(20)  NULL,
  bg         VARCHAR(20)  NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
  id             INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(300)    NOT NULL,
  description    TEXT            NULL,
  subject_id     INT UNSIGNED    NOT NULL,
  uploader_id    INT UNSIGNED    NOT NULL,
  file_name      VARCHAR(400)    NOT NULL,
  file_original  VARCHAR(300)    NOT NULL,
  file_type      ENUM('PDF','DOCX','PPTX') NOT NULL,
  file_size      INT UNSIGNED    NOT NULL,
  download_count INT UNSIGNED    NOT NULL DEFAULT 0,
  status         ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  quiz_status    ENUM('NONE','PENDING','DONE','FAILED') NOT NULL DEFAULT 'NONE',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id)  REFERENCES subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY (uploader_id) REFERENCES users(id)    ON DELETE CASCADE,
  FULLTEXT  idx_ft       (title, description),
  INDEX     idx_status   (status),
  INDEX     idx_subject  (subject_id),
  INDEX     idx_uploader (uploader_id),
  INDEX     idx_downloads(download_count),
  INDEX     idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  document_id INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY  uq_user_doc  (user_id, document_id),
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  content     TEXT         NOT NULL,
  likes       INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  INDEX idx_doc_comments (document_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quizzes (
  id            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200)     NOT NULL,
  subject_id    INT UNSIGNED     NOT NULL,
  document_id   INT UNSIGNED     NULL,
  difficulty    ENUM('Dễ','Trung bình','Khó') NOT NULL DEFAULT 'Trung bình',
  time_minutes  TINYINT UNSIGNED NOT NULL DEFAULT 10,
  attempt_count INT UNSIGNED     NOT NULL DEFAULT 0,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id)  REFERENCES subjects(id)   ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES documents(id)  ON DELETE CASCADE,
  INDEX idx_subject_quiz (subject_id),
  INDEX idx_doc_quiz     (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quiz_id     INT UNSIGNED NOT NULL,
  text        TEXT         NOT NULL,
  options     JSON         NOT NULL,
  answer      TINYINT      NOT NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  INDEX idx_quiz_q (quiz_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED     NOT NULL,
  quiz_id      INT UNSIGNED     NOT NULL,
  score        TINYINT UNSIGNED NOT NULL,
  total        TINYINT UNSIGNED NOT NULL,
  time_elapsed SMALLINT UNSIGNED NULL,
  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  INDEX idx_user_attempts (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- SEED DATA
-- ──────────────────────────────────────────────────────────────

INSERT IGNORE INTO subjects (name, slug, icon, color, bg) VALUES
('Toán',                    'toan',                 '📐', '#3B82F6', '#EFF6FF'),
('Lý',                      'ly',                   '⚛️',  '#10B981', '#ECFDF5'),
('Công nghệ thông tin',     'cong-nghe-thong-tin',  '💻', '#8B5CF6', '#F5F3FF'),
('Cơ khí',                  'co-khi',               '⚙️',  '#6B7280', '#F9FAFB'),
('Điện - Điện tử',          'dien-dien-tu',         '⚡', '#F59E0B', '#FFFBEB'),
('Hoá và Khoa học sự sống', 'hoa-khoa-hoc-su-song', '🧪', '#84CC16', '#F7FEE7'),
('Vật liệu',                'vat-lieu',             '🔩', '#EC4899', '#FDF2F8'),
('Kinh tế',                 'kinh-te',              '📊', '#06B6D4', '#ECFEFF'),
('Ngoại ngữ',               'ngoai-ngu',            '🌍', '#14B8A6', '#F0FDFA'),
('Xã hội học',              'xa-hoi-hoc',           '🏛️',  '#A78BFA', '#F5F3FF'),
('Bổ trợ',                  'bo-tro',               '📚', '#EF4444', '#FEF2F2');

-- Admin account: password = Admin@123456
INSERT IGNORE INTO users (name, email, password_hash, role) VALUES
('Admin HuStudy', 'admin@hustudy.vn',
 '$2a$12$rJBTpkEdDZSL501R/swU6utNd0UR7HlqjPMeJPECHYoytIOO4puIq',
 'ADMIN');

-- Sample quizzes (subject IDs: Toán=1, Lý=2, CNTT=3, Kinh tế=8)
INSERT IGNORE INTO quizzes (id, title, subject_id, difficulty, time_minutes) VALUES
(1, 'Giải tích 1 — Kiểm tra nhanh',   1, 'Trung bình', 10),
(2, 'Lập trình C++ cơ bản',            3, 'Dễ',         20),
(3, 'Vật lý đại cương — Cơ học',       2, 'Khó',        15),
(4, 'Kinh tế vi mô cơ bản',            8, 'Trung bình', 25),
(5, 'Python nhập môn',                 3, 'Dễ',         12);

-- Questions for quiz 1 (Giải tích 1)
INSERT IGNORE INTO questions (quiz_id, text, options, answer, sort_order) VALUES
(1, 'Đạo hàm của hàm số f(x) = x² là?',
 '["f\'(x) = x","f\'(x) = 2x","f\'(x) = 2","f\'(x) = x²"]', 1, 1),
(1, 'Giới hạn của (sin x)/x khi x → 0 bằng bao nhiêu?',
 '["0","∞","1","Không tồn tại"]', 2, 2),
(1, 'Nguyên hàm của f(x) = 3x² là?',
 '["x³ + C","6x + C","3x³ + C","x² + C"]', 0, 3),
(1, 'Hàm số f(x) = |x| có đạo hàm tại x = 0 không?',
 '["Có, bằng 0","Có, bằng 1","Có, bằng -1","Không có đạo hàm"]', 3, 4),
(1, 'Tích phân ∫₀¹ x dx bằng?',
 '["1","1/2","2","0"]', 1, 5);

-- Questions for quiz 2 (C++)
INSERT IGNORE INTO questions (quiz_id, text, options, answer, sort_order) VALUES
(2, 'Kiểu dữ liệu nào lưu số nguyên trong C++?',
 '["float","char","int","string"]', 2, 1),
(2, 'Để in ra màn hình trong C++ ta dùng?',
 '["print()","printf()","cout <<","System.out.println()"]', 2, 2),
(2, 'Vòng lặp nào luôn thực thi ít nhất một lần?',
 '["for","while","do...while","foreach"]', 2, 3),
(2, 'Ký hiệu nào dùng để lấy địa chỉ của biến?',
 '["*","&","#","@"]', 1, 4),
(2, 'Hàm main() trong C++ trả về kiểu gì?',
 '["void","string","int","bool"]', 2, 5);
