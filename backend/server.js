// backend/server.js
// Main entry point — Express server + scheduler boot

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

const apiRoutes     = require('./routes/api');
const { startScheduler } = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API routes ────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Nazrah Dashboard running on port ${PORT}            ║`);
  console.log(`║  Open: http://localhost:${PORT}                      ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  // Boot scheduler
  startScheduler();

  // Run first fetch immediately on startup (if no data yet)
  const db = require('./db');
  const lastFetch = db.prepare(`SELECT value FROM settings WHERE key = 'last_fetch'`).get();
  if (!lastFetch || !lastFetch.value) {
    console.log('[Server] No previous fetch data — running initial fetch in 3 seconds...');
    setTimeout(() => {
      require('./services/fetchOrchestrator').runFullFetch()
        .then(r => console.log('[Server] Initial fetch complete:', r.success ? 'OK' : r.error))
        .catch(e => console.error('[Server] Initial fetch error:', e.message));
    }, 3000);
  }
});

module.exports = app;
