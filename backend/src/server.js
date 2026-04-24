// src/server.js — SnapLink Express + PostgreSQL server
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./db');
const { generateSlug, hashIp, parseUserAgent, parseReferrer } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Trust proxy (needed on Render for correct IP detection)
app.set('trust proxy', 1);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many links created. Wait a minute.' },
});

app.use('/api/', apiLimiter);

// ── API: Create link ──────────────────────────────────────────
app.post('/api/links', createLimiter, async (req, res) => {
  try {
    let { url, customSlug, password, expiresIn, utmSource, utmMedium, utmCampaign } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch (e) { return res.status(400).json({ error: 'Invalid URL format' }); }

    // UTM params
    if (utmSource || utmMedium || utmCampaign) {
      const u = new URL(url);
      if (utmSource)   u.searchParams.set('utm_source', utmSource);
      if (utmMedium)   u.searchParams.set('utm_medium', utmMedium);
      if (utmCampaign) u.searchParams.set('utm_campaign', utmCampaign);
      url = u.toString();
    }

    // Slug
    let slug = customSlug ? customSlug.toLowerCase().replace(/[^a-z0-9-]/g, '') : null;
    if (slug) {
      if (slug.length < 2 || slug.length > 30) return res.status(400).json({ error: 'Slug must be 2–30 characters' });
      if (await db.slugExists(slug)) return res.status(409).json({ error: 'Slug already taken. Try another.' });
    } else {
      let attempts = 0;
      do {
        slug = generateSlug(attempts > 5 ? 8 : 6);
        if (++attempts > 20) return res.status(500).json({ error: 'Could not generate unique slug' });
      } while (await db.slugExists(slug));
    }

    // Expiry
    let expiresAt = null;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      if (isNaN(days) || days < 1 || days > 365) return res.status(400).json({ error: 'expiresIn must be 1–365 days' });
      expiresAt = Date.now() + days * 86400000;
    }

    const link = await db.createLink({
      slug, originalUrl: url,
      displayUrl: req.body.url,
      password: password || null,
      expiresAt
    });

    res.status(201).json(formatLink(link));

  } catch (err) {
    console.error('Create link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: List links ───────────────────────────────────────────
app.get('/api/links', async (req, res) => {
  try {
    const { search = '', sort = 'created_at', dir = 'DESC', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    const result = await db.getAllLinks({ search, sortBy: sort, sortDir: dir, limit: limitNum, offset });

    res.json({
      links: result.links.map(formatLink),
      total: result.total,
      page: pageNum,
      pages: Math.ceil(result.total / limitNum)
    });
  } catch (err) {
    console.error('List links error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: Get single link + stats ──────────────────────────────
app.get('/api/links/:id', async (req, res) => {
  try {
    const link = await db.getLinkById(parseInt(req.params.id));
    if (!link || !link.is_active) return res.status(404).json({ error: 'Link not found' });
    const stats = await db.getClickStats(link.id);
    res.json({ ...formatLink(link), stats });
  } catch (err) {
    console.error('Get link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: Delete link ──────────────────────────────────────────
app.delete('/api/links/:id', async (req, res) => {
  try {
    const link = await db.getLinkById(parseInt(req.params.id));
    if (!link || !link.is_active) return res.status(404).json({ error: 'Link not found' });
    await db.deleteLink(link.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: Global stats ─────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getGlobalStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: AI Insight (key stays server-side) ───────────────────
app.post('/api/ai-insight', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    return res.json({ insight: 'Add ANTHROPIC_API_KEY to your environment variables to enable AI insights.' });
  }

  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `URL: ${url}\nSlug: ${slug}\n\nGive a sharp 2-3 sentence analysis: what this URL leads to, one sharing tip, a suggested use case. Concise, no markdown.`
        }]
      })
    });
    const data = await response.json();
    res.json({ insight: data.content?.[0]?.text || 'Analysis unavailable.' });
  } catch (err) {
    res.json({ insight: 'AI insight unavailable.' });
  }
});

// ── Redirect route ────────────────────────────────────────────
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  if (slug.startsWith('api') || slug.includes('.')) return res.status(404).send('Not found');

  try {
    const link = await db.getLinkBySlug(slug);

    if (!link || !link.is_active) return res.redirect('/?error=not_found');
    if (link.expires_at && Date.now() > link.expires_at) return res.redirect('/?error=expired');

    // Password check
    if (link.password) {
      const provided = req.query.pw;
      if (!provided || provided !== link.password) {
        return res.redirect(`/?unlock=${slug}`);
      }
    }

    // Record click (non-blocking)
    const ua = req.headers['user-agent'] || '';
    const { deviceType, browser, os } = parseUserAgent(ua);
    const referrer = parseReferrer(req.headers['referer'] || req.headers['referrer'] || '');
    const ipHash = hashIp(req.ip || '');

    setImmediate(() => {
      db.recordClick({ linkId: link.id, ipHash, deviceType, browser, os, referrer, country: 'Unknown' })
        .catch(e => console.error('Click record error:', e));
    });

    res.redirect(301, link.original_url);

  } catch (err) {
    console.error('Redirect error:', err);
    res.redirect('/?error=server');
  }
});

// ── Helpers ───────────────────────────────────────────────────
function formatLink(link) {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: `${BASE_URL}/${link.slug}`,
    originalUrl: link.original_url,
    displayUrl: link.display_url,
    hasPassword: !!link.password,
    expiresAt: link.expires_at ? parseInt(link.expires_at) : null,
    createdAt: parseInt(link.created_at),
    clicks: link.click_count || 0,
    lastClickAt: link.last_click_at ? parseInt(link.last_click_at) : null
  };
}

// ── Start server ──────────────────────────────────────────────
async function start() {
  try {
    await db.initSchema();
    app.listen(PORT, () => {
      console.log(`\n🔗 SnapLink running at ${BASE_URL}`);
      console.log(`   API:  ${BASE_URL}/api/links`);
      console.log(`   Env:  ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
