// backend/services/telegramFetcher.js
// Fetches public Telegram channel via t.me/s/ (no API key needed)

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const CHANNEL = process.env.TELEGRAM_CHANNEL || 'blockbullacademy';
const URL = `https://t.me/s/${CHANNEL}`;

async function fetchTelegram() {
  const result = {
    platform: 'telegram',
    channel: CHANNEL,
    url: URL,
    fetched_at: new Date().toISOString(),
    subscribers: null,
    total_photos: null,
    total_videos: null,
    total_links: null,
    latest_post_num: null,
    latest_post_views: null,
    avg_views_last10: null,
    view_trend: null,      // 'rising' | 'declining' | 'stable'
    posts: [],             // last N posts with views
    issues: [],
    score: 100,            // health score 0-100
  };

  try {
    const res = await fetch(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NazrahBot/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // ── Subscriber count ──────────────────────────────────────
    const counterText = $('.tgme_page_extra').text().trim();
    // e.g. "101 subscribers"
    const subMatch = counterText.match(/(\d[\d,]*)\s*subscriber/i);
    if (subMatch) result.subscribers = parseInt(subMatch[1].replace(/,/g, ''));

    // ── Media counts from description block ───────────────────
    const extraText = $('.tgme_channel_info_counters').text();
    const photoMatch = extraText.match(/(\d+)\s*photo/i);
    const videoMatch = extraText.match(/(\d+)\s*video/i);
    const linkMatch  = extraText.match(/(\d+)\s*link/i);
    if (photoMatch) result.total_photos = parseInt(photoMatch[1]);
    if (videoMatch) result.total_videos = parseInt(videoMatch[1]);
    if (linkMatch)  result.total_links  = parseInt(linkMatch[1]);

    // ── Individual posts ──────────────────────────────────────
    const posts = [];
    $('.tgme_widget_message').each((i, el) => {
      const $el = $(el);

      // Post number from data-post attr: "blockbullacademy/1132"
      const postAttr = $el.attr('data-post') || '';
      const numMatch = postAttr.match(/\/(\d+)$/);
      const postNum = numMatch ? parseInt(numMatch[1]) : null;

      // Views
      const viewsText = $el.find('.tgme_widget_message_views').text().trim();
      const views = parseViews(viewsText);

      // Content
      const text = $el.find('.tgme_widget_message_text').text().trim().slice(0, 200);

      // Post type classification
      const type = classifyPost(text, $el, $);

      // Time
      const time = $el.find('time').attr('datetime') || '';

      if (postNum) {
        posts.push({ postNum, views, text, type, time });
      }
    });

    // Sort by post number descending
    posts.sort((a, b) => b.postNum - a.postNum);
    result.posts = posts.slice(0, 15);

    if (posts.length > 0) {
      result.latest_post_num  = posts[0].postNum;
      result.latest_post_views = posts[0].views;

      const viewsList = posts.slice(0, 10).map(p => p.views).filter(v => v !== null);
      if (viewsList.length >= 2) {
        result.avg_views_last10 = Math.round(viewsList.reduce((a, b) => a + b, 0) / viewsList.length);

        // Trend: compare first half vs second half
        const half = Math.floor(viewsList.length / 2);
        const recent = viewsList.slice(0, half);
        const older  = viewsList.slice(half);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = ((recentAvg - olderAvg) / olderAvg) * 100;
        if (diff < -10)      result.view_trend = 'declining';
        else if (diff > 10)  result.view_trend = 'rising';
        else                 result.view_trend = 'stable';
      }
    }

    // ── Generate issues ───────────────────────────────────────
    result.issues = generateTelegramIssues(result);
    result.score  = calcTelegramScore(result);

  } catch (err) {
    result.error = err.message;
    result.issues.push({
      type: 'error',
      severity: 'critical',
      title: 'Fetch failed',
      desc: err.message,
    });
  }

  return result;
}

function parseViews(text) {
  if (!text) return null;
  text = text.trim().replace(/,/g, '');
  if (text.endsWith('K')) return Math.round(parseFloat(text) * 1000);
  if (text.endsWith('M')) return Math.round(parseFloat(text) * 1000000);
  const n = parseInt(text);
  return isNaN(n) ? null : n;
}

function classifyPost(text, $el, $) {
  const lower = text.toLowerCase();
  const hasImage = $el.find('.tgme_widget_message_photo').length > 0;
  const hasLink  = $el.find('a[href]').length > 2;

  if (lower.includes('lirunex') || lower.includes('premium') || lower.includes('step 1')) return 'cta';
  if (lower.includes('instagram.com')) return 'ig_repost';
  if (lower.includes('retail') || lower.includes('sentiment') || lower.includes('bias') || lower.includes('bearish') || lower.includes('bullish')) return 'analysis';
  if (hasImage && text.length < 50) return 'image';
  if (hasLink && text.length < 80) return 'news_repost';
  return 'filler';
}

function generateTelegramIssues(data) {
  const issues = [];

  if (data.subscribers !== null && data.subscribers < 200) {
    issues.push({
      type: 'growth',
      severity: 'critical',
      title: `Only ${data.subscribers} subscribers — below monetization threshold`,
      desc: `Need 500+ subs before paid tier is viable. Currently ${data.subscribers}. Run Instagram → Telegram funnel campaign.`,
      task: 'Run Telegram growth campaign on all 3 Instagram accounts — target 200 subs this week',
    });
  }

  if (data.view_trend === 'declining') {
    issues.push({
      type: 'reach',
      severity: 'critical',
      title: `Views declining — latest post ${data.latest_post_views} views`,
      desc: `Avg last 10 posts: ${data.avg_views_last10} views. Trend is downward. Likely cause: over-posting or low engagement signals.`,
      task: 'Post one interactive poll today to reset Telegram algorithm reach',
    });
  }

  if (data.latest_post_views !== null && data.subscribers && data.latest_post_views / data.subscribers < 0.12) {
    const rate = ((data.latest_post_views / data.subscribers) * 100).toFixed(1);
    issues.push({
      type: 'engagement',
      severity: 'high',
      title: `Low view rate: ${rate}% of subscribers seeing posts`,
      desc: 'Telegram channels with <15% view rate are being deprioritised in subscriber feeds. Post less, engage more.',
      task: 'Reduce to 1 quality post per day. Add a poll or question in every post.',
    });
  }

  // Check for over-posting (multiple posts close together)
  if (data.posts.length >= 4) {
    const recentTimes = data.posts.slice(0, 6).map(p => new Date(p.time)).filter(d => !isNaN(d));
    if (recentTimes.length >= 4) {
      const gaps = [];
      for (let i = 0; i < recentTimes.length - 1; i++) {
        gaps.push(Math.abs(recentTimes[i] - recentTimes[i+1]) / 60000); // minutes
      }
      const minGap = Math.min(...gaps);
      if (minGap < 60) {
        issues.push({
          type: 'frequency',
          severity: 'high',
          title: 'Over-posting detected — multiple posts within 1 hour',
          desc: 'Rapid posting signals spam to Telegram algorithm. Space posts 8+ hours apart.',
          task: 'Post maximum 1 time per day. Schedule it for 9am IST.',
        });
      }
    }
  }

  // Count post types
  const typeCounts = {};
  for (const p of data.posts) typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  const analysisCount = typeCounts['analysis'] || 0;
  const fillerCount = (typeCounts['filler'] || 0) + (typeCounts['ig_repost'] || 0) + (typeCounts['news_repost'] || 0);
  if (fillerCount > analysisCount && data.posts.length >= 5) {
    issues.push({
      type: 'content_quality',
      severity: 'high',
      title: `${fillerCount} filler/repost posts vs ${analysisCount} analysis posts in last ${data.posts.length}`,
      desc: 'Your analysis posts get the most views. Filler and IG reposts drag engagement down.',
      task: 'Post only Gold analysis, retail sentiment, and trade insights. Stop IG reposts on Telegram.',
    });
  }

  return issues;
}

function calcTelegramScore(data) {
  let score = 100;
  if (!data.subscribers || data.subscribers < 100)  score -= 30;
  else if (data.subscribers < 300)                   score -= 20;
  else if (data.subscribers < 500)                   score -= 10;
  if (data.view_trend === 'declining')               score -= 25;
  if (data.view_trend === 'stable')                  score -= 5;
  if (data.latest_post_views !== null && data.subscribers) {
    const rate = data.latest_post_views / data.subscribers;
    if (rate < 0.10)      score -= 20;
    else if (rate < 0.15) score -= 10;
  }
  return Math.max(0, score);
}

module.exports = { fetchTelegram };
