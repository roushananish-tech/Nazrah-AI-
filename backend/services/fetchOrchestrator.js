// backend/services/fetchOrchestrator.js
// Called by scheduler AND by the manual "Refresh" button in the dashboard
// Runs all fetchers, saves snapshots, auto-generates tasks

const db = require('../db');
const { fetchTelegram }     = require('./telegramFetcher');
const { auditWebsite }      = require('./websiteAuditor');
const { generateTasksFromData } = require('./taskGenerator');

async function runFullFetch() {
  const logId = db.prepare(`
    INSERT INTO fetch_log (started_at, platforms) VALUES (datetime('now'), ?)
  `).run(JSON.stringify(['telegram', 'website'])).lastInsertRowid;

  console.log(`[Fetch #${logId}] Starting full platform fetch — ${new Date().toISOString()}`);

  let tasksGenerated = 0;
  let telegramData = null;
  let websiteData  = null;

  try {
    // ── Fetch all platforms in parallel ───────────────────────
    [telegramData, websiteData] = await Promise.all([
      fetchTelegram().catch(e => ({ platform: 'telegram', error: e.message, issues: [] })),
      auditWebsite().catch(e => ({ platform: 'website',  error: e.message, issues: [] })),
    ]);

    // ── Save snapshots ─────────────────────────────────────────
    const saveSnapshot = db.prepare(`
      INSERT INTO platform_snapshots (platform, fetched_at, data, raw_issues)
      VALUES (?, ?, ?, ?)
    `);

    saveSnapshot.run('telegram', telegramData.fetched_at, JSON.stringify(telegramData), JSON.stringify(telegramData.issues));
    saveSnapshot.run('website',  websiteData.fetched_at,  JSON.stringify(websiteData),  JSON.stringify(websiteData.issues));

    // ── Save individual Telegram posts ────────────────────────
    if (telegramData.posts && telegramData.posts.length > 0) {
      const savePost = db.prepare(`
        INSERT OR IGNORE INTO telegram_posts (post_num, views, content, post_type, fetched_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const savePosts = db.transaction((posts) => {
        for (const p of posts) {
          savePost.run(p.postNum, p.views, p.text, p.type, telegramData.fetched_at);
        }
      });
      savePosts(telegramData.posts);
    }

    // ── Auto-generate tasks ───────────────────────────────────
    tasksGenerated = generateTasksFromData(telegramData, websiteData);
    console.log(`[Fetch #${logId}] Generated ${tasksGenerated} new tasks`);

    // ── Update last_fetch setting ─────────────────────────────
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'last_fetch'`)
      .run(new Date().toISOString());

    // ── Complete log ───────────────────────────────────────────
    db.prepare(`
      UPDATE fetch_log SET finished_at = datetime('now'), success = 1, tasks_generated = ?
      WHERE id = ?
    `).run(tasksGenerated, logId);

    console.log(`[Fetch #${logId}] Complete. Telegram subs: ${telegramData.subscribers}, Website score: ${websiteData.score}`);

    return {
      success: true,
      logId,
      tasksGenerated,
      telegram: telegramData,
      website: websiteData,
    };

  } catch (err) {
    db.prepare(`
      UPDATE fetch_log SET finished_at = datetime('now'), success = 0, error = ? WHERE id = ?
    `).run(err.message, logId);

    console.error(`[Fetch #${logId}] Failed:`, err.message);
    return { success: false, error: err.message, logId };
  }
}

module.exports = { runFullFetch };
