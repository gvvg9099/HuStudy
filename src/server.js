require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme_admin_token';

/**
 * POST /api/docs/:id/report
 * Body: { user_id?, user_name?, reason }
 * Response: { count, flagged }
 */
app.post('/api/docs/:id/report', async (req, res) => {
  const docId = parseInt(req.params.id, 10);
  const { user_id, user_name, reason } = req.body || {};
  if (!docId) return res.status(400).json({ error: 'invalid doc id' });

  try {
    // ensure document exists
    const docRes = await db.query('SELECT id, flagged FROM documents WHERE id = $1', [docId]);
    if (docRes.rowCount === 0) return res.status(404).json({ error: 'document not found' });

    // insert report
    await db.query(
      `INSERT INTO reports (doc_id, user_id, user_name, reason) VALUES ($1, $2, $3, $4)`,
      [docId, user_id || null, user_name || 'anon', reason || null]
    );

    // recompute count (simple approach)
    const countRes = await db.query('SELECT COUNT(*)::int AS cnt FROM reports WHERE doc_id = $1', [docId]);
    const count = countRes.rows[0].cnt;

    // update documents.report_count and check threshold
    let flagged = docRes.rows[0].flagged;
    await db.query('UPDATE documents SET report_count = $1 WHERE id = $2', [count, docId]);
    if (count >= 3 && !flagged) {
      await db.query('UPDATE documents SET flagged = true WHERE id = $1', [docId]);
      flagged = true;
      // create a simple admin notification record
      await db.query(
        'INSERT INTO admin_notifications (doc_id, message) VALUES ($1, $2)',
        [docId, `Document ${docId} reached ${count} reports`]
      );
      console.log(`Doc ${docId} flagged; admin notified.`);
    }

    return res.json({ count, flagged });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
});

/**
 * GET /api/docs/:id/reports
 * Admin-only (simple check via ?adminToken=)
 */
app.get('/api/docs/:id/reports', async (req, res) => {
  const token = req.query.adminToken || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });

  const docId = parseInt(req.params.id, 10);
  if (!docId) return res.status(400).json({ error: 'invalid doc id' });

  try {
    const reports = await db.query(
      `SELECT id, user_id, user_name, reason, created_at FROM reports WHERE doc_id = $1 ORDER BY created_at ASC`,
      [docId]
    );
    const doc = await db.query('SELECT id, title, content, report_count, flagged FROM documents WHERE id = $1', [docId]);
    return res.json({ doc: doc.rows[0] || null, reports: reports.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
});

/**
 * GET /api/reported
 * Admin-only: list docs that have reports (report_count >= 1)
 */
app.get('/api/reported', async (req, res) => {
  const token = req.query.adminToken || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });

  try {
    const rows = await db.query('SELECT id, title, content, report_count, flagged FROM documents WHERE report_count > 0 ORDER BY report_count DESC');
    return res.json({ docs: rows.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
});

/**
 * For demo: get all documents (public)
 */
app.get('/api/docs', async (req, res) => {
  try {
    const rows = await db.query('SELECT id, title, content, report_count, flagged FROM documents ORDER BY id ASC');
    return res.json({ docs: rows.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// static hosting for demo UI (optional)
const path = require('path');
app.use('/', express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
