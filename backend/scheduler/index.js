// backend/scheduler/index.js
// Auto-runs fetchOrchestrator on schedule defined in .env

const cron = require('node-cron');
const { runFullFetch } = require('../services/fetchOrchestrator');

const SCHEDULE = process.env.FETCH_SCHEDULE || '0 8 * * *'; // default: 8am daily

function startScheduler() {
  if (!cron.validate(SCHEDULE)) {
    console.error('[Scheduler] Invalid cron schedule:', SCHEDULE);
    return;
  }

  console.log(`[Scheduler] Auto-fetch scheduled: "${SCHEDULE}" (IST timezone)`);

  const job = cron.schedule(SCHEDULE, async () => {
    console.log('[Scheduler] Triggered auto-fetch —', new Date().toISOString());
    try {
      const result = await runFullFetch();
      if (result.success) {
        console.log(`[Scheduler] Auto-fetch complete. ${result.tasksGenerated} new tasks generated.`);
        console.log(`[Scheduler] Telegram: ${result.telegram?.subscribers} subs, ${result.telegram?.latest_post_views} latest views`);
        console.log(`[Scheduler] Website score: ${result.website?.score}/100`);
      } else {
        console.error('[Scheduler] Auto-fetch failed:', result.error);
      }
    } catch (err) {
      console.error('[Scheduler] Unexpected error:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata', // IST
  });

  return job;
}

module.exports = { startScheduler };
