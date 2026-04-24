// src/db.js — PostgreSQL database layer using pg
const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Required for Render's PostgreSQL (uses SSL)
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Check your DATABASE_URL in .env');
  } else {
    console.log('✅ Database connected');
    release();
  }
});

// Helper — run a query
const query = (text, params) => pool.query(text, params);

// ── Schema init ───────────────────────────────────────────────
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS links (
      id          SERIAL PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      display_url  TEXT NOT NULL,
      password     TEXT DEFAULT NULL,
      expires_at   BIGINT DEFAULT NULL,
      created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
      is_active    BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
    CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC);

    CREATE TABLE IF NOT EXISTS clicks (
      id          SERIAL PRIMARY KEY,
      link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      clicked_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
      ip_hash     TEXT,
      device_type TEXT DEFAULT 'desktop',
      browser     TEXT DEFAULT 'Unknown',
      os          TEXT DEFAULT 'Unknown',
      referrer    TEXT DEFAULT 'Direct',
      country     TEXT DEFAULT 'Unknown'
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);
    CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON clicks(clicked_at DESC);
  `);
  console.log('✅ Schema ready');
}

// ── Links ─────────────────────────────────────────────────────

async function createLink({ slug, originalUrl, displayUrl, password, expiresAt }) {
  const res = await query(
    `INSERT INTO links (slug, original_url, display_url, password, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [slug, originalUrl, displayUrl, password || null, expiresAt || null]
  );
  return res.rows[0];
}

async function getLinkBySlug(slug) {
  const res = await query('SELECT * FROM links WHERE slug = $1', [slug]);
  return res.rows[0] || null;
}

async function getLinkById(id) {
  const res = await query('SELECT * FROM links WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getAllLinks({ search = '', sortBy = 'created_at', sortDir = 'DESC', limit = 100, offset = 0 } = {}) {
  // Whitelist sort columns to prevent SQL injection
  const allowedCols = ['created_at', 'slug'];
  const col = allowedCols.includes(sortBy) ? `l.${sortBy}` : 'click_count';
  const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';
  const searchPct = `%${search}%`;

  const res = await query(
    `SELECT l.*,
            COUNT(c.id)::int AS click_count,
            MAX(c.clicked_at) AS last_click_at
     FROM links l
     LEFT JOIN clicks c ON c.link_id = l.id
     WHERE l.is_active = TRUE
       AND (l.slug ILIKE $1 OR l.original_url ILIKE $1 OR l.display_url ILIKE $1)
     GROUP BY l.id
     ORDER BY ${col} ${dir}
     LIMIT $2 OFFSET $3`,
    [searchPct, limit, offset]
  );

  const countRes = await query(
    `SELECT COUNT(*)::int AS n FROM links
     WHERE is_active = TRUE
       AND (slug ILIKE $1 OR original_url ILIKE $1 OR display_url ILIKE $1)`,
    [searchPct]
  );

  return { links: res.rows, total: countRes.rows[0].n };
}

async function deleteLink(id) {
  await query('UPDATE links SET is_active = FALSE WHERE id = $1', [id]);
}

async function slugExists(slug) {
  const res = await query('SELECT 1 FROM links WHERE slug = $1', [slug]);
  return res.rows.length > 0;
}

// ── Clicks ────────────────────────────────────────────────────

async function recordClick({ linkId, ipHash, deviceType, browser, os, referrer, country }) {
  await query(
    `INSERT INTO clicks (link_id, ip_hash, device_type, browser, os, referrer, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [linkId, ipHash || null, deviceType, browser, os, referrer, country || 'Unknown']
  );
}

async function getClickStats(linkId) {
  const [total, byDevice, byReferrer, byDay, byBrowser] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM clicks WHERE link_id = $1', [linkId]),
    query(`SELECT device_type, COUNT(*)::int AS count FROM clicks WHERE link_id = $1 GROUP BY device_type`, [linkId]),
    query(`SELECT referrer, COUNT(*)::int AS count FROM clicks WHERE link_id = $1 GROUP BY referrer ORDER BY count DESC LIMIT 10`, [linkId]),
    query(`SELECT TO_CHAR(TO_TIMESTAMP(clicked_at/1000), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
           FROM clicks WHERE link_id = $1
           GROUP BY day ORDER BY day DESC LIMIT 30`, [linkId]),
    query(`SELECT browser, COUNT(*)::int AS count FROM clicks WHERE link_id = $1 GROUP BY browser ORDER BY count DESC LIMIT 8`, [linkId])
  ]);

  return {
    total: total.rows[0].n,
    byDevice: byDevice.rows,
    byReferrer: byReferrer.rows,
    byDay: byDay.rows,
    byBrowser: byBrowser.rows
  };
}

async function getGlobalStats() {
  const now = Date.now();
  const fourteenDaysAgo = now - 14 * 86400000;

  const [
    totalLinks, totalClicks, activeLinks,
    clicksByDay, topLinks, deviceBreakdown, referrerBreakdown
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM links WHERE is_active = TRUE`),
    query(`SELECT COUNT(*)::int AS n FROM clicks`),
    query(`SELECT COUNT(*)::int AS n FROM links WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > $1)`, [now]),
    query(`SELECT TO_CHAR(TO_TIMESTAMP(clicked_at/1000), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
           FROM clicks WHERE clicked_at > $1
           GROUP BY day ORDER BY day ASC`, [fourteenDaysAgo]),
    query(`SELECT l.slug, l.original_url, COUNT(c.id)::int AS clicks
           FROM links l LEFT JOIN clicks c ON c.link_id = l.id
           WHERE l.is_active = TRUE
           GROUP BY l.id ORDER BY clicks DESC LIMIT 5`),
    query(`SELECT device_type, COUNT(*)::int AS count FROM clicks GROUP BY device_type`),
    query(`SELECT referrer, COUNT(*)::int AS count FROM clicks GROUP BY referrer ORDER BY count DESC LIMIT 8`)
  ]);

  return {
    totalLinks: totalLinks.rows[0].n,
    totalClicks: totalClicks.rows[0].n,
    activeLinks: activeLinks.rows[0].n,
    clicksByDay: clicksByDay.rows,
    topLinks: topLinks.rows,
    deviceBreakdown: deviceBreakdown.rows,
    referrerBreakdown: referrerBreakdown.rows
  };
}

module.exports = {
  query, initSchema,
  createLink, getLinkBySlug, getLinkById, getAllLinks, deleteLink, slugExists,
  recordClick, getClickStats, getGlobalStats
};
