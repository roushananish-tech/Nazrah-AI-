// backend/services/taskGenerator.js
// Reads latest platform snapshots and auto-generates today's tasks
// Deduplicates against existing open tasks

const db = require('../db');

function generateTasksFromData(telegramData, websiteData) {
  const generatedTasks = [];

  // ── From Telegram ─────────────────────────────────────────
  for (const issue of (telegramData.issues || [])) {
    if (issue.task) {
      generatedTasks.push({
        title: issue.task,
        detail: issue.desc,
        priority: issue.severity === 'critical' ? 'critical' : 'high',
        source: 'telegram',
        source_tag: 'Auto · Telegram',
        time_est: 'Today',
        auto: 1,
      });
    }
  }

  // Dynamic tasks based on Telegram numbers
  if (telegramData.subscribers !== null) {
    const subs = telegramData.subscribers;

    if (subs < 150) {
      generatedTasks.push({
        title: `Push Telegram to 150 subs — currently at ${subs}. Post IG Story with Telegram link + "Free Gold analysis daily."`,
        detail: 'Below 150 subs is pre-monetization. Growth sprint needed this week.',
        priority: 'critical', source: 'telegram', source_tag: 'Auto · Growth', time_est: '20 min', auto: 1,
      });
    } else if (subs < 300) {
      generatedTasks.push({
        title: `Push Telegram from ${subs} → 300 subs. Run "Join before we go paid" campaign on all IG accounts.`,
        detail: '300 subs = minimum viable paid tier launch point.',
        priority: 'high', source: 'telegram', source_tag: 'Auto · Growth', time_est: '30 min', auto: 1,
      });
    } else if (subs >= 300 && subs < 500) {
      generatedTasks.push({
        title: `You have ${subs} subs — launch ₹199/month paid Telegram tier now.`,
        detail: '300+ subscribers = time to monetize. Set up Telegram Stars or direct UPI collection.',
        priority: 'critical', source: 'telegram', source_tag: 'Auto · Monetization', time_est: '2 hours', auto: 1,
      });
    }

    if (telegramData.view_trend === 'declining') {
      generatedTasks.push({
        title: 'Views declining — post one interactive poll today: "Gold this week: Bullish or Bearish? 🗳"',
        detail: `Latest post: ${telegramData.latest_post_views} views. Avg last 10: ${telegramData.avg_views_last10}. Polls reset algorithm suppression.`,
        priority: 'critical', source: 'telegram', source_tag: 'Auto · Reach', time_est: '5 min', auto: 1,
      });
    }
  }

  // ── From Website ──────────────────────────────────────────
  for (const issue of (websiteData.issues || [])) {
    if (issue.task) {
      generatedTasks.push({
        title: issue.task,
        detail: issue.desc,
        priority: issue.severity === 'critical' ? 'critical' : 'high',
        source: 'website',
        source_tag: 'Auto · Website',
        time_est: 'Today',
        auto: 1,
      });
    }
  }

  // Site health score warning
  if (websiteData.score !== undefined && websiteData.score < 50) {
    generatedTasks.push({
      title: `Website health score is ${websiteData.score}/100 — fix the top 3 issues before sending any DMs to fashion clients`,
      detail: 'Clients will check the site before paying. A broken site kills your credibility.',
      priority: 'critical', source: 'website', source_tag: 'Auto · Health', time_est: 'Today', auto: 1,
    });
  }

  // ── Daily recurring tasks (always add if not done today) ──
  const today = new Date().toISOString().split('T')[0];

  const existingDailyTitles = db.prepare(`
    SELECT title FROM tasks
    WHERE date(created_at) = ? AND done = 0
  `).all(today).map(r => r.title);

  const dailyTasks = [
    {
      title: 'Post 1 Telegram market update today (Gold bias or retail sentiment format)',
      detail: 'Analysis posts are your best-performing content type. 1 quality post per day max.',
      priority: 'maintenance', source: 'telegram', source_tag: 'Daily', time_est: '15 min', auto: 1,
    },
    {
      title: 'Cross-post Telegram update to @nazrah.ai Instagram with "Full analysis on Telegram 👆 link in bio"',
      detail: 'Build the Instagram → Telegram funnel every single day.',
      priority: 'maintenance', source: 'instagram', source_tag: 'Daily', time_est: '5 min', auto: 1,
    },
    {
      title: 'Check WhatsApp for AI Fashion inquiries — respond within 30 min',
      detail: 'Your only inbound sales channel. Never let an inquiry sit unanswered.',
      priority: 'maintenance', source: 'fashion', source_tag: 'Daily', time_est: '2 min', auto: 1,
    },
    {
      title: 'Review XAUUSD 1H structure — set trading bias before London session',
      detail: 'Trading is stream 1. Prep before the session or skip the day.',
      priority: 'maintenance', source: 'trading', source_tag: 'Daily', time_est: '10 min', auto: 1,
    },
  ];

  for (const dt of dailyTasks) {
    if (!existingDailyTitles.some(t => t === dt.title)) {
      generatedTasks.push(dt);
    }
  }

  // ── Deduplicate against existing open tasks ───────────────
  const openTasks = db.prepare(`
    SELECT title FROM tasks WHERE done = 0
  `).all().map(r => r.title.toLowerCase().slice(0, 60));

  const newTasks = generatedTasks.filter(t => {
    const key = t.title.toLowerCase().slice(0, 60);
    return !openTasks.includes(key);
  });

  // ── Insert new tasks ──────────────────────────────────────
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, detail, priority, source, source_tag, time_est, auto, created_at)
    VALUES (@title, @detail, @priority, @source, @source_tag, @time_est, @auto, datetime('now'))
  `);

  const insertMany = db.transaction((tasks) => {
    for (const t of tasks) insertTask.run(t);
  });

  insertMany(newTasks);

  return newTasks.length;
}

module.exports = { generateTasksFromData };
