# Nazrah Command Center — Full Backend App

## What This Is
A real web app with:
- **Auto-fetch every 24hrs** via cron scheduler (node-cron)
- **Live Telegram fetch** from @blockbullacademy — subscribers, views, post data
- **Website auditor** — nazrahstudio.netlify.app bugs, score, issues
- **Auto-generated tasks** based on actual platform data
- **SQLite database** — stores all history, tasks, revenue entries
- **Revenue logging** — track each stream manually
- **Full REST API** — all endpoints authenticated

---

## Deploy in 15 Minutes — Railway (Free)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Nazrah dashboard"
git remote add origin https://github.com/YOUR_USERNAME/nazrah-dashboard.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to railway.app → New Project → Deploy from GitHub
2. Select your repo
3. Railway auto-detects Node.js and runs `npm start`

### Step 3 — Set Environment Variables on Railway
In Railway dashboard → Variables tab, add:
```
DASHBOARD_PASSWORD=your_secret_password
TELEGRAM_CHANNEL=blockbullacademy
FASHION_SITE_URL=https://nazrahstudio.netlify.app
FETCH_SCHEDULE=0 8 * * *
REVENUE_GOAL=200000
GOAL_MONTHS=6
```

### Step 4 — Run DB Setup (one-time)
In Railway → Service → Settings → run command:
```
node backend/db/setup.js
```

### Step 5 — Open Your Dashboard
Railway gives you a URL like: `https://nazrah-dashboard-production.up.railway.app`
Open it → enter your password → dashboard loads with live data.

---

## Deploy on Render (Alternative Free Option)

1. render.com → New Web Service → Connect GitHub
2. Build Command: `npm install`
3. Start Command: `node backend/server.js`
4. Add same environment variables as above
5. Free tier sleeps after 15min inactivity — upgrade to $7/mo for always-on

---

## Local Development
```bash
# Install
npm install

# Setup database (run once)
npm run setup

# Copy env file
cp .env.example .env
# Edit .env with your values

# Run
npm run dev
# Opens at http://localhost:3000
```

---

## Project Structure
```
nazrah-dashboard/
├── backend/
│   ├── server.js                 # Express server entry
│   ├── db/
│   │   ├── index.js              # DB singleton
│   │   └── setup.js              # Table creation + seed data
│   ├── routes/
│   │   └── api.js                # All REST endpoints
│   ├── services/
│   │   ├── telegramFetcher.js    # Scrapes t.me/s/blockbullacademy
│   │   ├── websiteAuditor.js     # Audits nazrahstudio.netlify.app
│   │   ├── taskGenerator.js      # Auto-generates tasks from platform data
│   │   └── fetchOrchestrator.js  # Runs all fetchers + saves to DB
│   └── scheduler/
│       └── index.js              # Cron job (runs every 24hrs)
├── frontend/
│   └── index.html                # Full dashboard UI
├── data/
│   └── nazrah.db                 # SQLite database (auto-created)
├── package.json
├── .env.example
└── README.md
```

---

## API Endpoints
All require header: `x-dashboard-password: YOUR_PASSWORD`

| Method | Path | What it does |
|--------|------|-------------|
| GET | /api/dashboard | Full data dump for frontend |
| POST | /api/fetch | Trigger manual platform fetch |
| PATCH | /api/tasks/:id/done | Mark task done/undone |
| POST | /api/tasks | Add manual task |
| DELETE | /api/tasks/:id | Delete task |
| POST | /api/revenue | Log revenue entry |
| PATCH | /api/settings | Update a setting |
| GET | /api/health | Uptime check |

---

## What Auto-Updates
Every day at 8am IST the scheduler runs and:
1. Fetches latest Telegram subscriber count, post views, view trend
2. Audits fashion website for bugs and issues
3. Compares vs previous snapshot
4. Auto-generates new tasks for anything that's lagging
5. Removes tasks that are resolved (e.g., website score went from 20 → 80)
6. Logs everything to the fetch_log table

## What Requires Manual Input
- Instagram data (Meta blocks all public scraping — check in-app Insights)
- Revenue entries (logged via the Revenue tab in dashboard)
- Task completion (click tasks to mark done)

---

## Upgrading Later
- Add WhatsApp alerts: CallMeBot free API (add phone + API key to .env)
- Add Instagram data: Use Instagram Basic Display API (requires Meta app approval)
- Add email reports: Nodemailer + Gmail SMTP (weekly summary)
- Move to PostgreSQL: Replace better-sqlite3 with pg for multi-user support
