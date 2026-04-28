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
# SnapLink 🔗

A full-stack URL shortener with a built-in analytics engine.  
Not just short links — track every click by device, browser, OS, and referrer,  
all while keeping user privacy intact (IPs are SHA-256 hashed, never stored raw).

**Live Demo:** https://snaplink-0ha1.onrender.com  
> ⚠️ Free tier — may take 20–30 seconds to wake up on first load.

**Stack:** Node.js · Express.js · PostgreSQL · Vanilla JS · Deployed on Render
