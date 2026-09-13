/**
 * Trace Super Admin auth → bulk import endpoints (local or API_URL).
 */
const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
const IDENT = process.env.SA_ID || 'rootadmin';
const PASS = process.env.SA_PASS || process.env.SUPER_ADMIN_PASSWORD || 'Super@Admin2026!';

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

async function req(path, { method = 'GET', token, body, cookieJar, csrf } = {}) {
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

async function main() {
  console.log('API', API);
  let r = await req('/csrf-token');
  let cookieJar = parseCookies(r.setCookie);
  let csrf = r.json?.data?.csrfToken;
  console.log('csrf', r.status, Boolean(csrf));

  r = await req('/auth/login/super-admin', {
    method: 'POST',
    cookieJar,
    csrf,
    body: { identifier: IDENT, password: PASS },
  });
  cookieJar = mergeCookies(cookieJar, r.setCookie);
  const data = r.json?.data ?? {};
  console.log('login', r.status, r.json?.error || {
    role: data.user?.role,
    regNo: data.user?.regNo,
    hasToken: Boolean(data.accessToken),
  });
  if (!data.accessToken) {
    // try alternate credentials for local
    for (const [id, pass] of [
      ['admin1@avichian.edu', 'Admin@12345'],
      ['SA001', 'Admin@12345'],
      ['admin@avichi.edu', 'Super@Admin2026!'],
      ['rootadmin', 'Super@Admin2026'],
    ]) {
      r = await req('/csrf-token');
      cookieJar = parseCookies(r.setCookie);
      csrf = r.json?.data?.csrfToken;
      r = await req('/auth/login/super-admin', {
        method: 'POST',
        cookieJar,
        csrf,
        body: { identifier: id, password: pass },
      });
      cookieJar = mergeCookies(cookieJar, r.setCookie);
      const d = r.json?.data ?? {};
      console.log('try', id, r.status, r.json?.error || d.user?.role);
      if (d.accessToken) {
        Object.assign(data, d);
        csrf = d.csrfToken || csrf;
        break;
      }
    }
  }
  if (!data.accessToken) process.exit(1);

  const token = data.accessToken;
  csrf = data.csrfToken || csrf;

  const me = await req('/profile/me', { token, cookieJar, csrf });
  console.log('profile/me', me.status, {
    role: me.json?.data?.role,
    regNo: me.json?.data?.regNo,
    error: me.json?.error,
  });

  const students = await req('/super-admin/students?limit=5', { token, cookieJar, csrf });
  console.log('students list', students.status, students.json?.error || `items=${students.json?.data?.items?.length}`);

  const detect = await req('/super-admin/students/import/detect', {
    method: 'POST',
    token,
    cookieJar,
    csrf,
    body: { headers: ['Name', 'Roll No', 'Email'] },
  });
  console.log('import/detect', detect.status, detect.json?.error || detect.json?.data);

  const history = await req('/super-admin/students/import/history', { token, cookieJar, csrf });
  console.log('import/history', history.status, history.json?.error || `rows=${history.json?.data?.length}`);

  // Student token should get 403
  r = await req('/csrf-token');
  cookieJar = parseCookies(r.setCookie);
  csrf = r.json?.data?.csrfToken;
  r = await req('/auth/login', {
    method: 'POST',
    cookieJar,
    csrf,
    body: { regNo: '25CALL01', password: 'CallTest@2026' },
  });
  cookieJar = mergeCookies(cookieJar, r.setCookie);
  const st = r.json?.data?.accessToken;
  if (st) {
    const bad = await req('/super-admin/students/import/detect', {
      method: 'POST',
      token: st,
      cookieJar,
      csrf: r.json?.data?.csrfToken || csrf,
      body: { headers: ['Name'] },
    });
    console.log('student→import/detect', bad.status, bad.json?.error);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
