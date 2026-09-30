'use strict';
// A pond's address: its name as a path (pond.nz/moonlit-reef): lower-case Latin letters and digits in words joined by
// hyphens, 3 to 32 long, accents dropped, and never one of the site's own paths. A name in another script (nothing
// left once it's written in Latin letters) has no address of its own: the pond keeps its seed name's, or its id.

const RESERVED = new Set(['api', 'js', 'audio', 'deploy', 'docs', 'server', 'tools', 'index', 'favicon', 'robots', 'sitemap', 'manifest', 'og', 'icon',
  'apple-touch-icon', 'admin', 'administrator', 'root', 'www', 'mail', 'static', 'assets', 'login', 'logout', 'auth', 'signin', 'signup', 'me', 'board',
  'leaderboard', 'neighbours', 'neighbors', 'wanderers', 'health', 'help', 'about', 'privacy', 'terms', 'pond', 'ponds', 'new', 'share', 'observe', 'official',
  'moderator', 'mod', 'null', 'undefined', 'nan', 'true', 'false', 'style', 'guide']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(name) {
  const s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length <= 32) return s;
  const cut = s.slice(0, 32), at = cut.lastIndexOf('-');
  return (at >= 12 ? cut.slice(0, at) : cut).replace(/-+$/, '');
}
const slugOk = (s) => typeof s === 'string' && s.length >= 3 && s.length <= 36 && SLUG_RE.test(s) && !RESERVED.has(s) && !/^[\d-]+$/.test(s);

module.exports = { slugify, slugOk, SLUG_RE, RESERVED };
