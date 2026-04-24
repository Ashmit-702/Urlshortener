// src/utils.js
const crypto = require('crypto');

const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateSlug(length = 6) {
  let slug = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    slug += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  }
  return slug;
}

function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.IP_SALT || 'snaplink-salt'))
    .digest('hex')
    .slice(0, 16);
}

function parseUserAgent(ua) {
  if (!ua) return { deviceType: 'unknown', browser: 'Unknown', os: 'Unknown' };

  let deviceType = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) deviceType = 'tablet';
  else if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) deviceType = 'mobile';

  let browser = 'Other';
  if (/edg\//i.test(ua))             browser = 'Edge';
  else if (/opr\//i.test(ua))        browser = 'Opera';
  else if (/chrome/i.test(ua))       browser = 'Chrome';
  else if (/safari/i.test(ua))       browser = 'Safari';
  else if (/firefox/i.test(ua))      browser = 'Firefox';
  else if (/msie|trident/i.test(ua)) browser = 'IE';

  let os = 'Other';
  if (/windows nt/i.test(ua))              os = 'Windows';
  else if (/mac os x/i.test(ua))           os = 'macOS';
  else if (/android/i.test(ua))            os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua))   os = 'iOS';
  else if (/linux/i.test(ua))              os = 'Linux';

  return { deviceType, browser, os };
}

const REFERRER_MAP = {
  'google': 'Google', 'bing': 'Bing', 'yahoo': 'Yahoo',
  'duckduckgo': 'DuckDuckGo', 't.co': 'Twitter', 'twitter': 'Twitter',
  'facebook': 'Facebook', 'instagram': 'Instagram', 'linkedin': 'LinkedIn',
  'reddit': 'Reddit', 'youtube': 'YouTube', 'github': 'GitHub',
  'whatsapp': 'WhatsApp', 'telegram': 'Telegram',
};

function parseReferrer(referer) {
  if (!referer) return 'Direct';
  try {
    const host = new URL(referer).hostname.replace('www.', '').toLowerCase();
    for (const [key, label] of Object.entries(REFERRER_MAP)) {
      if (host.includes(key)) return label;
    }
    return host || 'Other';
  } catch {
    return 'Direct';
  }
}

module.exports = { generateSlug, hashIp, parseUserAgent, parseReferrer };
