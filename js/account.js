'use strict';
// Signing in (with Discord) keeps your ponds on the server under your account, so they follow you:
// sign in on another browser and Your ponds lists them, to open as your own (not a copy) and to
// keep growing there, no key needed. Each pond can show your Discord name to visitors and on the
// leaderboard, if you tick it (off by default). Where the server hasn't sign-in set up, or with no
// server at all, none of this shows.

const Account = { auth: false, user: null, ponds: [], at: 0 };

async function fetchMe() {
  if (typeof Net === 'undefined' || !Net.base) return Account;
  try {
    const r = await api('GET', '/me');
    Account.auth = !!r.auth;
    Account.user = r.user || null;
    Account.ponds = Array.isArray(r.ponds) ? r.ponds : [];
    Account.at = Date.now();
  } catch { /* offline: stay as we were */ }
  return Account;
}
const accountPond = (id) => (id && Account.ponds.find((p) => p.id === id)) || null;

// Off to Discord and back to this pond.
function signIn() {
  saveNow();
  const back = world.link && world.link.id && !world.observe ? `/${linkName(world.link)}` : '/';
  location.assign(`${Net.base}/auth/discord?back=${encodeURIComponent(back)}`);
}
async function signOut() {
  try { await api('POST', '/logout', {}); } catch { /* the session lapses anyway */ }
  Account.user = null;
  Account.ponds = [];
  renderAccount();
  if ($('ponds').open) renderPondList();
  showTicker('Signed out. Your ponds are still here in this browser');
}

// Every pond of yours in this browser that has a link goes under your account.
async function claimLocalPonds() {
  if (!Account.user) return 0;
  const have = new Set(Account.ponds.map((p) => p.id)), links = [];
  for (const s of listSaves()) {
    const d = s.link && loadSave(s.seed);
    if (d && d.link && d.link.key) links.push(d.link);
  }
  if (world.link && world.link.key && !world.observe) links.push(world.link);
  let n = 0;
  for (const L of links) {
    if (have.has(L.id)) continue;
    have.add(L.id);
    try { await api('POST', '/me/claim', { id: L.id, key: L.key }); n++; } catch { /* someone else's, or gone from the server */ }
  }
  if (n) await fetchMe();
  return n;
}

// Your own pond, as this browser last saw it, or the server's copy if another of your browsers
// has taken it further since.
async function newerFromAccount(mine, meP) {
  if (!mine || !mine.link || !mine.link.id) return mine;
  await meP;
  const p = accountPond(mine.link.id);
  if (!p || !(p.days > mine.days + 0.01)) return mine;
  const got = await fetchPond(mine.link.id, true);
  return got && got.save && got.save.days > mine.days ? { ...got.save, link: mine.link } : mine;
}

// The sign-in line in Your ponds.
function renderAccount() {
  const box = $('account');
  if (!box) return;
  box.hidden = !Account.auth || !!world.observe;
  if (box.hidden) return;
  const G = world.game, mine = world.link && accountPond(world.link.id);
  const note = document.createElement('p'), row = document.createElement('div');
  note.className = 'note';
  row.className = 'account-row';
  if (!Account.user) {
    note.textContent = 'Sign in to keep your ponds in your account: sign in on any other browser and carry on where you left off.';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wide discord'; b.textContent = 'Sign in with Discord';
    b.addEventListener('click', signIn);
    row.append(b);
    box.replaceChildren(note, row);
    return;
  }
  const who = document.createElement('div'), out = document.createElement('button');
  who.className = 'who';
  who.append('Signed in as ', Object.assign(document.createElement('b'), { textContent: Account.user.name }));
  out.type = 'button'; out.textContent = 'Sign out';
  out.addEventListener('click', signOut);
  row.append(who, out);
  note.textContent = mine ? 'This pond is kept in your account.' : world.link ? 'Putting this pond in your account…' : 'This pond goes into your account once it has its link (in a few seconds).';
  const show = document.createElement('label'), cb = document.createElement('input');
  show.className = 'check';
  cb.type = 'checkbox'; cb.id = 'show-name'; cb.checked = !!G.showName; cb.disabled = !mine;
  show.title = 'Your Discord name shows on this pond: to visitors, on the beach and on the leaderboard';
  show.append(cb, ' Show my name on this pond');
  cb.addEventListener('change', () => { G.showName = cb.checked; world.gameDirty = true; saveNow(); syncPond(true); });
  box.replaceChildren(row, note, show);
}

// A note by the menu pointing out signing in, and what it's for: shown when sign-in is on and you're
// not signed in, not on someone else's pond, and not put off lately.
function maybeNudgeSignIn() {
  const box = document.getElementById('signin-nudge');
  if (!box || !Account.auth || Account.user || (typeof world !== 'undefined' && world.observe)) return;
  let later = 0;
  try { later = +localStorage.getItem('pond.nudgeLater') || 0; } catch { /* storage unavailable */ }
  if (Date.now() < later) return;
  box.hidden = false;
}
{
  const box = document.getElementById('signin-nudge');
  if (box) {
    document.getElementById('nudge-signin').addEventListener('click', () => { box.hidden = true; signIn(); });
    document.getElementById('nudge-later').addEventListener('click', () => {
      box.hidden = true;
      try { localStorage.setItem('pond.nudgeLater', String(Date.now() + 3 * 86400000)); } catch { /* storage unavailable */ }
    });
  }
}

