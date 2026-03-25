// backend/routes/api.js
// All REST endpoints consumed by the dashboard frontend

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { runFullFetch } = require('../services/fetchOrchestrator');

// ── AUTH middleware (simple password gate) ──────────────────
const AUTH_PASS = process.env.DASHBOARD_PASSWORD || 'nazrah2026';

function auth(req, res, next) {
  const pass = req.headers['x-dashboard-password'] || req.query.p;
  if (pass !== AUTH_PASS) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── GET /api/dashboard — main data load ────────────────────
router.get('/dashboard', auth, (req, res) => {
  try {
    // Settings
    const settings = {};
    db.prepare('SELECT key, value FROM settings').all()
      .forEach(r => settings[r.key] = r.value);

    // Latest platform snapshots
    const latestTelegram = db.prepare(`
      SELECT data, fetched_at FROM platform_snapshots
      WHERE platform = 'telegram' ORDER BY fetched_at DESC LIMIT 1
    `).get();

    const latestWebsite = db.prepare(`
      SELECT data, fetched_at FROM platform_snapshots
      WHERE platform = 'website' ORDER BY fetched_at DESC LIMIT 1
    `).get();

    // All open tasks grouped by priority
    const tasks = {
      critical:    db.prepare(`SELECT * FROM tasks WHERE done = 0 AND priority = 'critical'    ORDER BY auto ASC, id ASC`).all(),
      high:        db.prepare(`SELECT * FROM tasks WHERE done = 0 AND priority = 'high'        ORDER BY auto ASC, id ASC`).all(),
      maintenance: db.prepare(`SELECT * FROM tasks WHERE done = 0 AND priority = 'maintenance' ORDER BY auto ASC, id ASC`).all(),
      done_today:  db.prepare(`SELECT * FROM tasks WHERE done = 1 AND date(done_at) = date('now') ORDER BY done_at DESC`).all(),
    };

    const taskCounts = {
      critical:    tasks.critical.length,
      high:        tasks.high.length,
      maintenance: tasks.maintenance.length,
      total_open:  tasks.critical.length + tasks.high.length + tasks.maintenance.length,
      done_today:  tasks.done_today.length,
    };

    // Revenue this month
    const thisMonth = new Date().toISOString().slice(0, 7);
    const revenue = db.prepare(`
      SELECT stream, SUM(amount) as total FROM revenue_entries
      WHERE month = ? GROUP BY stream
    `).all(thisMonth);

    const revenueByStream = {};
    let totalThisMonth = 0;
    for (const r of revenue) {
      revenueByStream[r.stream] = r.total;
      totalThisMonth += r.total;
    }

    // Revenue history (last 6 months)
    const revenueHistory = db.prepare(`
      SELECT month, stream, SUM(amount) as total
      FROM revenue_entries
      GROUP BY month, stream
      ORDER BY month DESC
      LIMIT 30
    `).all();

    // Telegram post view history (for chart)
    const viewHistory = db.prepare(`
      SELECT post_num, views, post_type, fetched_at
      FROM telegram_posts
      ORDER BY post_num DESC
      LIMIT 20
    `).all();

    // Last 10 fetch log entries
    const fetchLog = db.prepare(`
      SELECT * FROM fetch_log ORDER BY started_at DESC LIMIT 10
    `).all();

    res.json({
      settings,
      telegram: latestTelegram ? JSON.parse(latestTelegram.data) : null,
      website:  latestWebsite  ? JSON.parse(latestWebsite.data)  : null,
      tasks,
      taskCounts,
      revenue: {
        this_month: totalThisMonth,
        by_stream: revenueByStream,
        history: revenueHistory,
        goal: parseInt(settings.revenue_goal || 200000),
        earned_total: parseInt(settings.earned_total || 0),
      },
      viewHistory,
      fetchLog,
      last_fetch: settings.last_fetch || null,
    });

  } catch (err) {
    console.error('/api/dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fetch — manual trigger ──────────────────────
router.post('/fetch', auth, async (req, res) => {
  try {
    console.log('[API] Manual fetch triggered');
    const result = await runFullFetch();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/tasks/:id/done — mark task complete ────────
router.patch('/tasks/:id/done', auth, (req, res) => {
  try {
    const { id } = req.params;
    const { done } = req.body;
    db.prepare(`
      UPDATE tasks SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
      WHERE id = ?
    `).run(done ? 1 : 0, done ? 1 : 0, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks — add manual task ─────────────────────
router.post('/tasks', auth, (req, res) => {
  try {
    const { title, detail, priority, source, time_est } = req.body;
    if (!title || !priority) return res.status(400).json({ error: 'title and priority required' });

    const result = db.prepare(`
      INSERT INTO tasks (title, detail, priority, source, source_tag, time_est, auto, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(title, detail || '', priority, source || 'manual', 'Manual', time_est || '');

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tasks/:id — delete task ───────────────────
router.delete('/tasks/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/revenue — log revenue entry ─────────────────
router.post('/revenue', auth, (req, res) => {
  try {
    const { stream, amount, note } = req.body;
    if (!stream || !amount) return res.status(400).json({ error: 'stream and amount required' });

    const month = new Date().toISOString().slice(0, 7);
    db.prepare(`
      INSERT INTO revenue_entries (stream, amount, month, note, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(stream, parseInt(amount), month, note || '');

    // Update total earned
    const total = db.prepare(`SELECT SUM(amount) as t FROM revenue_entries`).get().t || 0;
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'earned_total'`).run(String(total));

    res.json({ success: true, new_total: total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/settings — update a setting ────────────────
router.patch('/settings', auth, (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ['revenue_goal', 'goal_months', 'earned_total', 'telegram_channel', 'fashion_site'];
    if (!allowed.includes(key)) return res.status(400).json({ error: 'key not allowed' });
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(value), key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health — uptime check ────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
