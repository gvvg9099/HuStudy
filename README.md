# HuStudy - Report Backend Demo (MySQL)

This is a minimal demo for "report document" functionality using Node/Express + MySQL.

Features:
- POST /api/docs/:id/report — submit a report for a document
- GET /api/docs/:id/reports — admin-only: view reports for a document
- GET /api/reported — admin-only: list reported documents
- Static demo UI in `public/` (index.html + admin.html)

Setup
1. Copy `.env.example` to `.env` and fill MySQL connection vars and ADMIN_TOKEN.
2. Create database and run migration:
   mysql -u <user> -p < db/init.sql
3. Install deps:
   npm install
4. Start server:
   npm start
   or for dev:
   npm run dev

Usage (demo)
- Open http://localhost:3000/ for the public UI to report documents.
- Open http://localhost:3000/admin.html, enter ADMIN_TOKEN from .env to view reported docs.

Notes
- This is a demo. For production, add proper auth, rate-limiting, duplicate-report policy, email/queue notifications, and tests.
- If you want, I can add Docker Compose to run MySQL + app together, or create a PR with these changes.
