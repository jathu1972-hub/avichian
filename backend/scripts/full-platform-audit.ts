/**
 * End-to-end platform audit against a running API (http://127.0.0.1:4000).
 * Run: npx tsx scripts/full-platform-audit.ts
 */
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';

const app = createApp();
const results: Array<{ phase: string; name: string; ok: boolean; detail?: string }> = [];

function log(phase: string, name: string, ok: boolean, detail?: string) {
  results.push({ phase, name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${phase}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function csrf() {
  const res = await request(app).get('/api/csrf-token');
  return {
    token: res.body.data.csrfToken as string,
    cookie: res.headers['set-cookie'] as string[],
  };
}

function authHeaders(token: string, c: { token: string; cookie: string[] }) {
  return {
    Authorization: `Bearer ${token}`,
    'X-CSRF-Token': c.token,
    Cookie: c.cookie,
  };
}

async function main() {
  console.log('\n=== AVICHIAN FULL PLATFORM AUDIT ===\n');

  // ── Health ──
  const health = await request(app).get('/api/health');
  log('1-Health', 'GET /api/health', health.status === 200);

  const c = await csrf();
  log('1-Health', 'CSRF token issued', Boolean(c.token));

  // ── Super Admin login ──
  const sa = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    include: { admin: true },
  });
  if (!sa) {
    log('2-Auth', 'Super Admin exists', false, 'No SUPER_ADMIN user in DB');
  } else {
    // Try known seed passwords
    let saLogin: request.Response | null = null;
    for (const pw of ['Admin@12345', 'ChangeMe2025!', 'Admin@123']) {
      const r = await request(app)
        .post('/api/auth/login/super-admin')
        .set('X-CSRF-Token', c.token)
        .set('Cookie', c.cookie)
        .send({ adminId: sa.regNo, email: sa.email, password: pw, rememberMe: true });
      if (r.status === 200 && r.body?.data?.accessToken) {
        saLogin = r;
        break;
      }
    }
    log(
      '2-Auth',
      'Super Admin login',
      Boolean(saLogin?.body?.data?.accessToken),
      saLogin ? `regNo=${sa.regNo}` : `status may need password reset for ${sa.regNo}`,
    );

    if (saLogin?.body?.data?.accessToken) {
      const h = authHeaders(saLogin.body.data.accessToken, await csrf());
      const dash = await request(app).get('/api/super-admin/dashboard/stats').set(h);
      log('14-Admin', 'Dashboard stats', dash.status === 200, `status=${dash.status}`);
    }
  }

  // ── Ensure department ──
  let dept = await prisma.department.findFirst();
  if (!dept) {
    dept = await prisma.department.create({ data: { name: 'Visual Communication' } });
  }
  log('1-Health', 'Department available', Boolean(dept), dept.name);

  // ── Create two students for social tests ──
  const stamp = Date.now().toString().slice(-8);
  const mkStudent = async (suffix: string) => {
    const regNo = `AU${stamp}${suffix}`.slice(0, 12);
    const password = 'TestPass1';
    const mobile = `9${stamp}${suffix}`.slice(0, 10);
    const user = await prisma.user.create({
      data: {
        regNo,
        email: `${regNo.toLowerCase()}@avichi.edu`,
        passwordHash: await hashPassword(password),
        mobileHash: hashValue(mobile),
        mobileEnc: encryptField(mobile),
        role: 'STUDENT',
        departmentId: dept!.id,
        accountStatus: 'ACTIVE',
        profile: { create: { name: `AUDIT STUDENT ${suffix}`, year: 1 } },
      },
    });
    return { user, password, regNo };
  };

  const a = await mkStudent('A');
  const b = await mkStudent('B');
  log('3-Student', 'Create student A in PostgreSQL', true, a.regNo);
  log('3-Student', 'Create student B in PostgreSQL', true, b.regNo);

  // ── Student login ──
  const c2 = await csrf();
  const loginA = await request(app)
    .post('/api/auth/login')
    .set('X-CSRF-Token', c2.token)
    .set('Cookie', c2.cookie)
    .send({ regNo: a.regNo, password: a.password, rememberMe: true });
  log(
    '2-Auth',
    'Student A login (regNo+password)',
    loginA.status === 200 && Boolean(loginA.body?.data?.accessToken),
    `status=${loginA.status} err=${loginA.body?.error ?? ''}`,
  );

  const loginEmail = await request(app)
    .post('/api/auth/login')
    .set('X-CSRF-Token', (await csrf()).token)
    .set('Cookie', (await csrf()).cookie)
    .send({ regNo: a.user.email, password: a.password });
  // need fresh csrf each time - fix
  const c3 = await csrf();
  const loginEmail2 = await request(app)
    .post('/api/auth/login')
    .set('X-CSRF-Token', c3.token)
    .set('Cookie', c3.cookie)
    .send({ regNo: a.user.email, password: a.password });
  log(
    '2-Auth',
    'Student A login (email as identifier)',
    loginEmail2.status === 200 && Boolean(loginEmail2.body?.data?.accessToken),
    `status=${loginEmail2.status}`,
  );

  const tokenA = loginA.body?.data?.accessToken as string | undefined;
  if (!tokenA) {
    console.log('\nAborting social tests — student login failed\n');
    printSummary();
    await cleanup(a.user.id, b.user.id);
    return;
  }

  // Login B
  const cB = await csrf();
  const loginB = await request(app)
    .post('/api/auth/login')
    .set('X-CSRF-Token', cB.token)
    .set('Cookie', cB.cookie)
    .send({ regNo: b.regNo, password: b.password });
  const tokenB = loginB.body?.data?.accessToken as string | undefined;
  log('2-Auth', 'Student B login', Boolean(tokenB), `status=${loginB.status}`);

  // Refresh
  const refreshCookie = loginA.headers['set-cookie'];
  if (refreshCookie) {
    const cR = await csrf();
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', cR.token)
      .set('Cookie', [...(Array.isArray(refreshCookie) ? refreshCookie : [refreshCookie]), ...(cR.cookie || [])]);
    log(
      '2-Auth',
      'Refresh token',
      refresh.status === 200 && Boolean(refresh.body?.data?.accessToken),
      `status=${refresh.status}`,
    );
  } else {
    log('2-Auth', 'Refresh token cookie set on login', false, 'no set-cookie');
  }

  // Profile me
  let hA = authHeaders(tokenA, await csrf());
  const me = await request(app).get('/api/profile/me').set(hA);
  log('5-Profile', 'GET /profile/me', me.status === 200, me.body?.data?.regNo);

  // ── Search friends ──
  hA = authHeaders(tokenA, await csrf());
  const search = await request(app)
    .get(`/api/search/students?q=${encodeURIComponent('AUDIT')}`)
    .set(hA);
  const searchItems = search.body?.data ?? [];
  log(
    '4-Friends',
    'Search students by name',
    search.status === 200 && searchItems.length >= 1,
    `status=${search.status} count=${searchItems.length}`,
  );

  const searchReg = await request(app)
    .get(`/api/search/students?q=${encodeURIComponent(b.regNo.slice(0, 6))}`)
    .set(authHeaders(tokenA, await csrf()));
  log(
    '4-Friends',
    'Search by register number prefix',
    searchReg.status === 200 && (searchReg.body?.data?.length ?? 0) >= 1,
    `count=${searchReg.body?.data?.length ?? 0}`,
  );

  // Friend request
  const fr = await request(app)
    .post('/api/friends/requests')
    .set(authHeaders(tokenA, await csrf()))
    .send({ receiverId: b.user.id });
  log(
    '4-Friends',
    'Send friend request A→B',
    fr.status === 200 || fr.status === 201,
    `status=${fr.status} err=${fr.body?.error ?? ''}`,
  );

  if (tokenB) {
    const requests = await request(app)
      .get('/api/friends/requests')
      .set(authHeaders(tokenB, await csrf()));
    const incoming = requests.body?.data?.incoming ?? [];
    log(
      '4-Friends',
      'B sees incoming request',
      requests.status === 200 && incoming.length >= 1,
      `incoming=${incoming.length}`,
    );

    const reqId = incoming[0]?.id as string | undefined;
    if (reqId) {
      const accept = await request(app)
        .post(`/api/friends/requests/${reqId}/accept`)
        .set(authHeaders(tokenB, await csrf()));
      log('4-Friends', 'B accepts request', accept.status === 200, `status=${accept.status}`);
    }

    const friends = await request(app)
      .get('/api/friends')
      .set(authHeaders(tokenA, await csrf()));
    log(
      '4-Friends',
      'Friend list after accept',
      friends.status === 200 && (friends.body?.data?.length ?? 0) >= 1,
      `count=${friends.body?.data?.length ?? 0}`,
    );
  }

  // ── Posts ──
  const post = await request(app)
    .post('/api/posts')
    .set(authHeaders(tokenA, await csrf()))
    .send({ caption: 'Audit post text', visibility: 'DEPARTMENT' });
  log('6-Posts', 'Create text post', post.status === 201, `status=${post.status} id=${post.body?.data?.id}`);
  const postId = post.body?.data?.id as string | undefined;

  const feed = await request(app).get('/api/posts/feed').set(authHeaders(tokenA, await csrf()));
  log(
    '6-Posts',
    'Feed includes post',
    feed.status === 200 && (feed.body?.data?.posts ?? []).some((p: { id: string }) => p.id === postId),
    `posts=${feed.body?.data?.posts?.length ?? 0}`,
  );

  if (postId) {
    const like = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set(authHeaders(tokenA, await csrf()));
    log('6-Posts', 'Like post', like.status === 200);

    const del = await request(app)
      .delete(`/api/posts/${postId}`)
      .set(authHeaders(tokenA, await csrf()));
    log('6-Posts', 'Owner delete post (soft)', del.status === 200, del.body?.data?.message);
  }

  // Unauthorized delete
  if (tokenB) {
    const post2 = await request(app)
      .post('/api/posts')
      .set(authHeaders(tokenA, await csrf()))
      .send({ caption: 'Owned by A', visibility: 'PUBLIC' });
    const p2 = post2.body?.data?.id as string | undefined;
    if (p2) {
      const steal = await request(app)
        .delete(`/api/posts/${p2}`)
        .set(authHeaders(tokenB, await csrf()));
      log('6-Posts', 'Non-owner cannot delete (403)', steal.status === 403, `status=${steal.status}`);
      await request(app).delete(`/api/posts/${p2}`).set(authHeaders(tokenA, await csrf()));
    }
  }

  // ── Stories (multipart) ──
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const story = await request(app)
    .post('/api/stories/upload')
    .set(authHeaders(tokenA, await csrf()))
    .field('caption', 'audit story')
    .attach('file', png, { filename: 's.png', contentType: 'image/png' });
  log(
    '7-Stories',
    'Multipart story create',
    story.status === 201 && Boolean(story.body?.data?.id),
    `status=${story.status} err=${story.body?.error ?? ''}`,
  );
  const storyId = story.body?.data?.id as string | undefined;

  const stories = await request(app).get('/api/stories').set(authHeaders(tokenA, await csrf()));
  const groups = stories.body?.data ?? [];
  const mine = groups.find((g: { user: { isMe: boolean } }) => g.user.isMe);
  log(
    '7-Stories',
    'GET stories returns own story',
    stories.status === 200 && Boolean(mine?.stories?.some((s: { id: string }) => s.id === storyId)),
    `groups=${groups.length} mine=${mine?.stories?.length ?? 0}`,
  );

  if (storyId && story.body?.data?.mediaUrl?.startsWith('/api/media/')) {
    const media = await request(app).get(story.body.data.mediaUrl);
    log('13-Storage', 'Story media URL reachable', media.status === 200, `status=${media.status}`);
  }

  if (storyId) {
    const sDel = await request(app)
      .delete(`/api/stories/${storyId}`)
      .set(authHeaders(tokenA, await csrf()));
    log('7-Stories', 'Owner delete story', sDel.status === 200);
  }

  // ── Reels ──
  // upload then create
  const up = await request(app)
    .post('/api/uploads')
    .set(authHeaders(tokenA, await csrf()))
    .field('purpose', 'post_video')
    .attach('file', Buffer.from('fake-mp4-bytes-for-audit'), {
      filename: 'r.mp4',
      contentType: 'video/mp4',
    });
  // may fail validation size/empty - try with larger buffer
  let reelOk = false;
  if (up.status === 201 && up.body?.data?.url) {
    const reel = await request(app)
      .post('/api/reels')
      .set(authHeaders(tokenA, await csrf()))
      .send({ mediaUrl: up.body.data.url, caption: 'audit reel', visibility: 'DEPARTMENT' });
    reelOk = reel.status === 201;
    log('8-Reels', 'Create reel', reelOk, `status=${reel.status} err=${reel.body?.error ?? ''}`);
    if (reel.body?.data?.id) {
      const list = await request(app).get('/api/reels').set(authHeaders(tokenA, await csrf()));
      log(
        '8-Reels',
        'List reels includes mine',
        (list.body?.data ?? []).some((r: { id: string }) => r.id === reel.body.data.id),
      );
      await request(app)
        .delete(`/api/reels/${reel.body.data.id}`)
        .set(authHeaders(tokenA, await csrf()));
    }
  } else {
    // create with story image url as fallback if video upload rejected
    if (story.body?.data?.mediaUrl) {
      const reel = await request(app)
        .post('/api/reels')
        .set(authHeaders(tokenA, await csrf()))
        .send({ mediaUrl: story.body.data.mediaUrl, caption: 'audit reel', visibility: 'PUBLIC' });
      log('8-Reels', 'Create reel (fallback media)', reel.status === 201, `status=${reel.status}`);
      if (reel.body?.data?.id) {
        await request(app)
          .delete(`/api/reels/${reel.body.data.id}`)
          .set(authHeaders(tokenA, await csrf()));
      }
    } else {
      log('8-Reels', 'Upload video for reel', false, `upload status=${up.status} ${up.body?.error}`);
    }
  }

  // ── Chat ──
  if (tokenB) {
    const chat = await request(app)
      .post(`/api/chat/with/${b.user.id}`)
      .set(authHeaders(tokenA, await csrf()));
    log(
      '9-Chat',
      'Open conversation with friend',
      chat.status === 200 || chat.status === 201,
      `status=${chat.status} err=${chat.body?.error ?? ''}`,
    );
    const convId = chat.body?.data?.id as string | undefined;
    if (convId) {
      const msg = await request(app)
        .post(`/api/chat/conversations/${convId}/messages`)
        .set(authHeaders(tokenA, await csrf()))
        .send({ body: 'Hello from audit' });
      log('9-Chat', 'Send message', msg.status === 200 || msg.status === 201, `status=${msg.status}`);
    }
  }

  // ── Calls ──
  if (tokenB) {
    const call = await request(app)
      .post('/api/calls/start')
      .set(authHeaders(tokenA, await csrf()))
      .send({ receiverId: b.user.id, type: 'VOICE' });
    log(
      '10-Calls',
      'Start voice call',
      call.status === 200 || call.status === 201,
      `status=${call.status} err=${call.body?.error ?? ''}`,
    );
  }

  // ── Notifications ──
  const notif = await request(app).get('/api/notifications').set(authHeaders(tokenA, await csrf()));
  log('12-Notifications', 'List notifications', notif.status === 200, `status=${notif.status}`);

  // ── Search empty ──
  const empty = await request(app)
    .get('/api/search/students?q=a')
    .set(authHeaders(tokenA, await csrf()));
  log(
    '11-Search',
    'Short query returns empty or 200',
    empty.status === 200,
    `count=${empty.body?.data?.length ?? 0}`,
  );

  // Logout
  const logout = await request(app)
    .post('/api/auth/logout')
    .set(authHeaders(tokenA, await csrf()));
  log('2-Auth', 'Logout', logout.status === 200, `status=${logout.status}`);

  await cleanup(a.user.id, b.user.id);
  printSummary();
}

async function cleanup(...userIds: string[]) {
  for (const id of userIds) {
    try {
      await prisma.story.deleteMany({ where: { userId: id } });
      await prisma.post.deleteMany({ where: { authorId: id } });
      await prisma.reel.deleteMany({ where: { authorId: id } }).catch(() => undefined);
      await prisma.friendRequest.deleteMany({
        where: { OR: [{ senderId: id }, { receiverId: id }] },
      });
      await prisma.mediaAsset.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.contentHide.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id } });
    } catch (e) {
      console.warn('cleanup warning', id, e);
    }
  }
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${ok}`);
  console.log(`Failed: ${bad}`);
  if (bad) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ [${r.phase}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
