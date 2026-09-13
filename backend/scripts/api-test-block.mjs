/** Quick block/unblock smoke test for 25CALL01 / 25CALL02 */
const API = 'http://127.0.0.1:4000/api';

function parseCookies(setCookie = []) {
  return setCookie.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}
function mergeCookies(prev, setCookie = []) {
  const map = new Map();
  for (const part of (prev || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf('=');
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const c of setCookie) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path, { method = 'GET', token, body, cookieJar, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookieJar) headers.Cookie = cookieJar;
  if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie };
}

async function login(regNo, password) {
  let r = await api('/csrf-token');
  let cookieJar = parseCookies(r.setCookie);
  let csrf = r.json?.data?.csrfToken;
  r = await api('/auth/login', { method: 'POST', body: { regNo, password }, cookieJar, csrf });
  cookieJar = mergeCookies(cookieJar, r.setCookie);
  const data = r.json?.data;
  return { token: data.accessToken, user: data.user, cookieJar, csrf: data.csrfToken || csrf };
}

const a = await login('25CALL01', 'CallTest@2026');
const b = await login('25CALL02', 'CallTest@2026');

// ensure chat open
const open = await api(`/chat/with/${b.user.id}`, {
  method: 'POST',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
const convId = open.json?.data?.id;
console.log('open', open.status, convId);

const block = await api(`/chat/conversations/${convId}/block-peer`, {
  method: 'POST',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
console.log('block', block.status, block.json);

const chats = await api('/chat/conversations', {
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
const stillThere = (chats.json?.data || []).some((c) => c.id === convId);
console.log('chat after block', stillThere ? 'STILL VISIBLE FAIL' : 'HIDDEN OK', (chats.json?.data || []).length);

// search should not show B to A (blocked)
const search = await api('/search?q=25CALL02&type=students', {
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
const hit = (search.json?.data?.students || []).some((s) => s.regNo === '25CALL02');
console.log('search blocked peer', hit ? 'STILL SHOWN FAIL' : 'HIDDEN OK');

// message should fail
const msg = await api(`/chat/conversations/${convId}/messages`, {
  method: 'POST',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
  body: { body: 'should fail' },
});
console.log('message after block', msg.status, msg.json?.error || msg.json?.success);

// unblock so accounts stay usable
const un = await api(`/safety/block/${b.user.id}`, {
  method: 'DELETE',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
// also try friends unblock
const un2 = await api(`/friends/blocked/${b.user.id}`, {
  method: 'DELETE',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
console.log('unblock', un.status, un2.status);

// restore friendship ACCEPTED via re-setup style: accept not available; use friends service endpoint if any
// For local usability re-run friendship via open may fail; log only
const open2 = await api(`/chat/with/${b.user.id}`, {
  method: 'POST',
  token: a.token,
  cookieJar: a.cookieJar,
  csrf: a.csrf,
});
console.log('reopen after unblock', open2.status, open2.json?.error || open2.json?.data?.id);
