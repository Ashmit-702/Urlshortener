# SnapLink — URL Shortener (PostgreSQL Edition)

## Project Structure

```
snaplink/
├── render.yaml          ← Render deployment config (auto-detected)
├── .gitignore
├── public/
│   └── index.html       ← Frontend
└── backend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── server.js    ← Express server
        ├── db.js        ← PostgreSQL queries
        └── utils.js     ← Helpers
```

---

## 🚀 Deploy to Render (Step by Step)

### Step 1 — Push to GitHub
```bash
# In the snaplink folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/snaplink.git
git push -u origin main
```

### Step 2 — Create Render account
Go to **render.com** → Sign up (free)

### Step 3 — Create PostgreSQL database first
1. Render dashboard → **New → PostgreSQL**
2. Name it: `snaplink-db`
3. Plan: **Free**
4. Click **Create Database**
5. Wait ~1 minute for it to be ready
6. Copy the **"Internal Database URL"** — you'll need it next

### Step 4 — Create Web Service
1. Render dashboard → **New → Web Service**
2. Connect your GitHub repo
3. Fill in settings:
   - **Name:** `snaplink`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Add Environment Variables:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(paste Internal Database URL from Step 3)* |
   | `BASE_URL` | *(your Render URL, e.g. https://snaplink.onrender.com)* |
5. Click **Create Web Service**

### Step 5 — Done! 🎉
Your site is live at `https://snaplink.onrender.com`

> ⚠️ **Note:** Free Render services spin down after 15 min of inactivity.
> First visit after idle takes ~30 seconds to wake up. This is normal on free tier.

---

## 💻 Run Locally

### Requirements
- Node.js 18+
- PostgreSQL installed locally (or use a free cloud DB)

### Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL to your local PostgreSQL
npm start
```

### Local PostgreSQL setup (if needed)
```bash
# macOS
brew install postgresql
brew services start postgresql
createdb snaplink

# Ubuntu/Linux
sudo apt install postgresql
sudo service postgresql start
sudo -u postgres createdb snaplink
```

Then set in `.env`:
```
DATABASE_URL=postgresql://postgres:@localhost:5432/snaplink
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/links` | Create short link |
| `GET` | `/api/links` | List all links |
| `GET` | `/api/links/:id` | Get link + stats |
| `DELETE` | `/api/links/:id` | Delete link |
| `GET` | `/api/stats` | Global analytics |
| `GET` | `/:slug` | Redirect to original URL |

### POST /api/links — Body
```json
{
  "url": "https://example.com/very-long-url",
  "customSlug": "my-link",
  "password": "optional-password",
  "expiresIn": 7,
  "utmSource": "twitter",
  "utmMedium": "social",
  "utmCampaign": "launch"
}
```
