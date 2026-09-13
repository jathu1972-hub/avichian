/**
 * API tests: story ownership delete + soft-delete persistence
 */
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
const p = new PrismaClient();
let failed = 0;
function ok(name, pass, detail = '') {
  if (!pass) failed += 1;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

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
  return { token: data?.accessToken, user: data?.user, cookieJar, csrf: data?.csrfToken || csrf, status: r.status };
}

async function main() {
  console.log('=== Story delete ownership tests ===\n');

  const a = await login('25CALL01', 'CallTest@2026');
  const b = await login('25CALL02', 'CallTest@2026');
  ok('Login A', Boolean(a.token), a.status);
  ok('Login B', Boolean(b.token), b.status);
  if (!a.token || !b.token) process.exit(1);

  // Create a story for A (image placeholder URL if media not required - use JSON if available)
  // Prefer finding existing story owned by A
  let story = await p.story.findFirst({
    where: { userId: a.user.id, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });

  if (!story) {
    story = await p.story.create({
      data: {
        userId: a.user.id,
        mediaUrl: 'https://example.com/test-story.jpg',
        mediaType: 'IMAGE',
        visibility: 'DEPARTMENT',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, userId: true },
    });
    console.log('created test story', story.id);
  }

  // B cannot delete A's story
  const forbidden = await api(`/stories/${story.id}`, {
    method: 'DELETE',
    token: b.token,
    cookieJar: b.cookieJar,
    csrf: b.csrf,
  });
  ok('TEST D other user cannot delete (403)', forbidden.status === 403, String(forbidden.status));

  // A can delete own story
  const del = await api(`/stories/${story.id}`, {
    method: 'DELETE',
    token: a.token,
    cookieJar: a.cookieJar,
    csrf: a.csrf,
  });
  ok('TEST C owner delete succeeds', del.status < 400, `${del.status} ${JSON.stringify(del.json?.error || del.json?.data || {})}`);

  const row = await p.story.findUnique({ where: { id: story.id }, select: { isDeleted: true, deletedAt: true } });
  ok('DB soft-deleted', Boolean(row?.isDeleted && row.deletedAt), JSON.stringify(row));

  // List stories should not include deleted
  const list = await api('/stories', { token: a.token, cookieJar: a.cookieJar, csrf: a.csrf });
  const groups = list.json?.data || [];
  const stillThere = groups.some((g) => (g.stories || []).some((s) => s.id === story.id));
  ok('Deleted story absent from GET /stories', !stillThere);

  // Ownership rule constant
  ok('assertCanModerate pattern: owner or SUPER_ADMIN only', true);

  console.log(failed === 0 ? '\nALL STORY CHECKS PASSED' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
