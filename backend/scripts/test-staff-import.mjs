/**
 * Smoke test: Super Admin bulk staff import + STAFF login on main app auth.
 */
const API = process.env.API_URL || 'http://127.0.0.1:4000/api';

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
  let r = await req('/csrf-token');
  let cookieJar = parseCookies(r.setCookie);
  let csrf = r.json?.data?.csrfToken;

  // Super Admin login
  for (const [id, pass] of [
    ['admin1@avichian.edu', 'Admin@12345'],
    ['rootadmin', process.env.SUPER_ADMIN_PASSWORD || 'Super@Admin2026!'],
    ['SA001', 'Admin@12345'],
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
    if (r.json?.data?.accessToken) {
      csrf = r.json.data.csrfToken || csrf;
      console.log('SA login', id, 'ok');
      break;
    }
  }
  const saToken = r.json?.data?.accessToken;
  if (!saToken) {
    console.error('No SA token', r.json);
    process.exit(1);
  }

  const depts = await req('/super-admin/departments', { token: saToken, cookieJar, csrf });
  const deptId = depts.json?.data?.[0]?.id;
  console.log('dept', depts.status, depts.json?.data?.[0]?.name);

  const suffix = Date.now().toString().slice(-6);
  const headers = ['Name', 'Staff ID', 'Email', 'Department', 'Designation'];
  const matrix = [
    [
      `Test Staff ${suffix}`,
      `STF${suffix}`,
      `stf${suffix}@avichi.edu`,
      depts.json?.data?.[0]?.name || 'Administration',
      'Assistant Professor',
    ],
  ];

  const preview = await req('/super-admin/staff/import/preview', {
    method: 'POST',
    token: saToken,
    cookieJar,
    csrf,
    body: { headers, matrix, departmentId: deptId },
  });
  console.log('preview', preview.status, {
    valid: preview.json?.data?.valid,
    total: preview.json?.data?.total,
    err: preview.json?.error,
  });

  const imp = await req('/super-admin/staff/import', {
    method: 'POST',
    token: saToken,
    cookieJar,
    csrf,
    body: { headers, matrix, departmentId: deptId, fileName: 'test-staff.csv' },
  });
  console.log('import', imp.status, {
    created: imp.json?.data?.created,
    creds: imp.json?.data?.credentials?.length,
    err: imp.json?.error,
  });

  const cred = imp.json?.data?.credentials?.[0];
  if (!cred) {
    console.error('no credentials');
    process.exit(1);
  }

  // Staff login via MAIN app login
  r = await req('/csrf-token');
  cookieJar = parseCookies(r.setCookie);
  csrf = r.json?.data?.csrfToken;
  r = await req('/auth/login', {
    method: 'POST',
    cookieJar,
    csrf,
    body: { regNo: cred.staffId, password: cred.temporaryPassword },
  });
  console.log('staff login', r.status, {
    role: r.json?.data?.user?.role,
    force: r.json?.data?.user?.forcePasswordChange,
    err: r.json?.error,
  });

  // Super admin path forbidden for staff
  if (r.json?.data?.accessToken) {
    const deny = await req('/super-admin/staff', {
      token: r.json.data.accessToken,
      cookieJar,
      csrf: r.json.data.csrfToken || csrf,
    });
    console.log('staff→super-admin', deny.status, deny.json?.error);
  }

  // Student cannot import
  // skip if no student

  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
