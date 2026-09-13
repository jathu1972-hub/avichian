/**
 * Live API tests against local server + real DB (CSRF + JWT).
 * node scripts/api-test-requirements.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:4000/api';

let failed = 0;
function ok(name, pass, detail = '') {
  if (!pass) failed += 1;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function parseCookies(setCookie = []) {
  return setCookie
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
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
  if (csrf && method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie };
}

async function bootstrapSession() {
  const r = await api('/csrf-token');
  const csrf = r.json?.data?.csrfToken;
  const cookieJar = parseCookies(r.setCookie);
  return { csrf, cookieJar };
}

async function login(regNo, password) {
  let { csrf, cookieJar } = await bootstrapSession();
  const r = await api('/auth/login', {
    method: 'POST',
    body: { regNo, password },
    cookieJar,
    csrf,
  });
  cookieJar = mergeCookies(cookieJar, r.setCookie);
  const data = r.json?.data ?? r.json;
  const token = data?.accessToken || data?.token;
  const nextCsrf = data?.csrfToken || csrf;
  return { ...r, token, user: data?.user, cookieJar, csrf: nextCsrf };
}

async function main() {
  console.log('=== Live API requirement tests ===\n');

  const health = await fetch('http://127.0.0.1:4000/api/health')
    .then((r) => r.json())
    .catch(() => null);
  ok('API health', Boolean(health?.status === 'ok' || health?.success), String(health?.status));

  const a = await login('25CALL01', 'CallTest@2026');
  const b = await login('25CALL02', 'CallTest@2026');
  ok('Login A', Boolean(a.token), a.json?.error || a.status);
  ok('Login B', Boolean(b.token), b.json?.error || b.status);
  if (!a.token || !b.token) {
    console.log(JSON.stringify(a.json, null, 2).slice(0, 500));
    process.exit(1);
  }

  const inactiveSearch = await api('/search?q=25VCM07&type=students', {
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  const studentsInactive = inactiveSearch.json?.data?.students || [];
  const hitInactive = studentsInactive.some((s) => s.regNo?.toUpperCase() === '25VCM07');
  ok('TEST1 inactive 25VCM07 not in search', !hitInactive, `count=${studentsInactive.length}`);

  const activeSearch = await api('/search?q=Call&type=students', {
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  const studentsActive = activeSearch.json?.data?.students || [];
  const hitActive = studentsActive.some(
    (s) => (s.name || '').includes('Call') || s.regNo?.includes('CALL'),
  );
  ok('TEST2 activated Call appears', hitActive, `count=${studentsActive.length}`);

  const rollSearch = await api('/search?q=25CALL02&type=students', {
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  const rollStudents = rollSearch.json?.data?.students || [];
  ok(
    'TEST10 search by roll 25CALL02',
    rollStudents.some((s) => s.regNo === '25CALL02'),
    `count=${rollStudents.length}`,
  );

  const open = await api(`/chat/with/${b.user.id}`, {
    method: 'POST',
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  const convId = open.json?.data?.id;
  ok('Open chat with friend B', open.status < 400 && Boolean(convId), open.json?.error || open.status);

  const chatsA = await api('/chat/conversations', {
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  const listA = chatsA.json?.data || [];
  ok('Chat list loads', Array.isArray(listA), String(chatsA.status));
  ok(
    'TEST3/4 chat only friends',
    listA.every((c) => c.peer),
    `peers=${listA.map((c) => c.peer?.regNo).join(',')}`,
  );

  if (convId) {
    const hide = await api(`/chat/conversations/${convId}`, {
      method: 'DELETE',
      token: a.token,
      cookieJar: a.cookieJar,
      csrf: a.csrf,
    });
    ok('TEST6 hide conversation API', hide.status < 400, hide.json?.error || hide.status);

    const afterHide = await api('/chat/conversations', {
      token: a.token,
      cookieJar: a.cookieJar,
      csrf: a.csrf,
    });
    const listAfter = afterHide.json?.data || [];
    ok('TEST6 gone from A list', !listAfter.some((c) => c.id === convId), `remaining=${listAfter.length}`);

    // Re-open for A (clear hide) so we don't leave test data broken
    await api(`/chat/with/${b.user.id}`, {
      method: 'POST',
      token: a.token,
      cookieJar: a.cookieJar,
      csrf: a.csrf,
    });

    const chatsB = await api('/chat/conversations', {
      token: b.token,
      cookieJar: b.cookieJar,
      csrf: b.csrf,
    });
    ok('TEST6 B list still works', Array.isArray(chatsB.json?.data), `B count=${(chatsB.json?.data || []).length}`);
  }

  const report = await api('/safety/report', {
    method: 'POST',
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
    body: {
      targetType: 'USER',
      targetId: b.user.id,
      reason: 'SPAM',
      details: 'API automated test report — ignore',
    },
  });
  ok(
    'TEST7 real report',
    report.status < 400 && (report.json?.success === true || report.json?.data),
    `${report.status} ${JSON.stringify(report.json?.error || report.json?.data || {}).slice(0, 120)}`,
  );

  console.log(failed === 0 ? '\nALL API CHECKS PASSED' : `\n${failed} API CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
