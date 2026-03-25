// backend/services/websiteAuditor.js
// Audits nazrahstudio.netlify.app for known bugs and issues

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const SITE = process.env.FASHION_SITE_URL || 'https://nazrahstudio.netlify.app';

async function auditWebsite() {
  const result = {
    platform: 'website',
    url: SITE,
    fetched_at: new Date().toISOString(),
    title_tag: null,
    has_meta_description: false,
    has_trading_tagline: false,
    has_base64_image: false,
    headline: null,
    whatsapp_number: null,
    nav_links: [],
    issues: [],
    score: 100,
  };

  const pageChecks = {
    '/pricing': false,
    '/portfolio': false,
    '/about': false,
  };

  try {
    // ── Main page ─────────────────────────────────────────────
    const res = await fetch(SITE, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NazrahAudit/1.0)' },
      timeout: 15000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    result.title_tag         = $('title').first().text().trim();
    result.has_meta_description = $('meta[name="description"]').length > 0;
    result.headline          = $('h1').first().text().trim().slice(0, 120);
    result.has_base64_image  = html.includes('data:image/');
    result.has_trading_tagline = html.toLowerCase().includes('vision beyond trading');

    // WhatsApp number
    const waLink = $('a[href*="wa.me"]').first().attr('href') || '';
    const waMatch = waLink.match(/wa\.me\/(\d+)/);
    if (waMatch) result.whatsapp_number = waMatch[1];

    // Nav links
    $('nav a, header a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (text && href) result.nav_links.push({ text, href });
    });

    // ── Sub-page checks ────────────────────────────────────────
    for (const path of Object.keys(pageChecks)) {
      try {
        const r = await fetch(SITE + path, { timeout: 8000 });
        const pageHtml = await r.text();
        const $p = cheerio.load(pageHtml);
        const bodyText = $p('body').text().replace(/\s+/g, ' ').trim();
        // A page is "real" if it has >200 chars of actual content
        pageChecks[path] = bodyText.length > 200;
      } catch { pageChecks[path] = false; }
    }
    result.page_checks = pageChecks;

    // ── Generate issues ───────────────────────────────────────
    result.issues = generateWebsiteIssues(result, pageChecks);
    result.score  = calcWebsiteScore(result, pageChecks);

  } catch (err) {
    result.error = err.message;
    result.issues.push({
      type: 'error', severity: 'critical',
      title: 'Site fetch failed', desc: err.message,
      task: 'Check that nazrahstudio.netlify.app is live and accessible.',
    });
  }

  return result;
}

function generateWebsiteIssues(data, pages) {
  const issues = [];

  // Title tag bug
  if (!data.title_tag || data.title_tag.toLowerCase() === 'package' || data.title_tag.toLowerCase() === 'home') {
    issues.push({
      type: 'seo', severity: 'critical',
      title: `Browser tab title is "${data.title_tag || 'missing'}"`,
      desc: 'Dev placeholder left in production. Every visitor sees this in their tab. Fix to: "Nazrah Studio — AI Fashion Photography | 48hr Delivery"',
      task: 'Fix website <title> tag — change from "Package" to your real brand name',
    });
  }

  // Trading tagline
  if (data.has_trading_tagline) {
    issues.push({
      type: 'branding', severity: 'critical',
      title: '"Vision Beyond Trading" tagline found on fashion site',
      desc: 'Your trading brand tagline is showing on a fashion photography website. Fashion clients see "trading" and leave.',
      task: 'Remove "Vision Beyond Trading" from nazrahstudio.netlify.app header',
    });
  }

  // Base64 image
  if (data.has_base64_image) {
    issues.push({
      type: 'performance', severity: 'critical',
      title: 'Hero image is base64 encoded — page loads slowly',
      desc: 'Base64 images bloat HTML by 33%, can\'t be browser-cached, and cause slow first load. Upload to Cloudinary and use a URL.',
      task: 'Upload hero image to Cloudinary and replace base64 src with a URL',
    });
  }

  // Meta description
  if (!data.has_meta_description) {
    issues.push({
      type: 'seo', severity: 'high',
      title: 'Missing meta description — hurts SEO and click-through',
      desc: 'No meta description found. Google will generate one automatically, usually poorly.',
      task: 'Add meta description: "Professional AI-generated fashion model photography for Indian clothing brands. 48hr delivery."',
    });
  }

  // Empty pages
  if (!pages['/pricing']) {
    issues.push({
      type: 'conversion', severity: 'critical',
      title: 'Pricing page is empty or missing',
      desc: 'Visitors who click Pricing find nothing and leave. This is killing conversions before any contact.',
      task: 'Add 3 pricing packages to /pricing: Starter ₹2,500 / Pro ₹5,000 / Campaign ₹9,000',
    });
  }

  if (!pages['/portfolio']) {
    issues.push({
      type: 'trust', severity: 'critical',
      title: 'Portfolio page is empty',
      desc: 'Clients need to see your work before paying. Empty portfolio = zero trust = no sale.',
      task: 'Generate 8 AI fashion images and upload them to the portfolio page before any outreach',
    });
  }

  if (!pages['/about']) {
    issues.push({
      type: 'trust', severity: 'high',
      title: 'About page is missing or empty',
      desc: 'B2B clients want to know who they\'re paying. Add 1 paragraph about Nazrah Studio.',
      task: 'Write About page — 1 paragraph about the service, how AI fashion photography works',
    });
  }

  // WhatsApp check
  if (!data.whatsapp_number) {
    issues.push({
      type: 'conversion', severity: 'high',
      title: 'WhatsApp CTA not found or not working',
      desc: 'WhatsApp is your primary lead capture. If it\'s broken, you\'re losing every interested visitor.',
      task: 'Verify WhatsApp CTA link is working on the fashion website',
    });
  }

  return issues;
}

function calcWebsiteScore(data, pages) {
  let score = 100;
  if (!data.title_tag || ['package','home',''].includes(data.title_tag.toLowerCase())) score -= 20;
  if (data.has_trading_tagline)   score -= 20;
  if (data.has_base64_image)      score -= 15;
  if (!data.has_meta_description) score -= 10;
  if (!pages['/pricing'])         score -= 20;
  if (!pages['/portfolio'])       score -= 15;
  if (!pages['/about'])           score -= 5;
  return Math.max(0, score);
}

module.exports = { auditWebsite };
