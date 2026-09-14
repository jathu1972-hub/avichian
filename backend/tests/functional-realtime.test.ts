import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocketServer } from '../src/socket.js';
import { prisma } from '../src/lib/prisma.js';
import { importStudentMasterFromPayload } from '../src/services/student-master.service.js';
import { registerWithMaster } from '../src/services/auth.service.js';
import { csrfHeaders, getCsrfToken, TEST_PASSWORD } from './helpers/test-utils.js';

// This suite is intentionally opt-in: it truncates only the explicitly named
// functional QA schema and talks to a real Socket.IO HTTP server.
const enabled = process.env.RUN_FUNCTIONAL_QA === '1' &&
  /schema=avichian_functional_qa\b/.test(process.env.TEST_DATABASE_URL ?? '');
const describeQa = enabled ? describe : describe.skip;

const studentA = { name: 'QA STUDENT A', reg_no: 'QA10001', mobile: '9000000001', email: 'qa.a@avichi.edu', department: 'QA Visual', year: 2025, role: 'student', verified: true } as const;
const studentB = { name: 'QA STUDENT B', reg_no: 'QA10002', mobile: '9000000002', email: 'qa.b@avichi.edu', department: 'QA Visual', year: 2025, role: 'student', verified: true } as const;

function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}
function event<T>(socket: Socket, name: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 5000);
    socket.once(name, (data: T) => { clearTimeout(timer); resolve(data); });
  });
}
function ack(socket: Socket, name: string, payload: unknown) {
  return new Promise<any>((resolve, reject) => socket.timeout(5000).emit(name, payload, (error: unknown, data: unknown) => error ? reject(error) : resolve(data)));
}
function disconnect(socket: Socket) {
  return new Promise<void>((resolve) => {
    if (!socket.connected) return resolve();
    socket.once('disconnect', () => resolve());
    socket.disconnect();
  });
}

describeQa('Functional QA: two-user realtime core', () => {
  const app = createApp();
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE users, student_master, departments RESTART IDENTITY CASCADE');
    await importStudentMasterFromPayload([studentA, studentB]);
    server = createServer(app);
    attachSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await prisma.$disconnect();
  });

  it('delivers friend, chat, typing, seen and incoming-call events in both directions', async () => {
    const tokenA = (await registerWithMaster({ regNo: studentA.reg_no, name: studentA.name, mobile: studentA.mobile, password: TEST_PASSWORD }, {})).accessToken;
    const tokenB = (await registerWithMaster({ regNo: studentB.reg_no, name: studentB.name, mobile: studentB.mobile, password: TEST_PASSWORD }, {})).accessToken;
    const [userA, userB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { regNo: studentA.reg_no } }),
      prisma.user.findUniqueOrThrow({ where: { regNo: studentB.reg_no } }),
    ]);
    const csrf = await getCsrfToken(app);
    const authA = { ...csrfHeaders(csrf), Authorization: `Bearer ${tokenA}` };
    const authB = { ...csrfHeaders(csrf), Authorization: `Bearer ${tokenB}` };

    const a = io(baseUrl, { auth: { token: tokenA }, transports: ['websocket'] });
    const b = io(baseUrl, { auth: { token: tokenB }, transports: ['websocket'] });
    await Promise.all([connected(a), connected(b)]);
    try {
      const sent = await request(app).post('/api/friends/requests').set(authA).send({ receiverId: userB.id });
      expect(sent.status).toBe(201);
      const incoming = await request(app).get('/api/friends/requests').set(authB);
      expect(incoming.body.data.incoming).toHaveLength(1);
      expect((await request(app).post(`/api/friends/requests/${incoming.body.data.incoming[0].id}/accept`).set(authB)).status).toBe(200);

      const chat = await request(app).post(`/api/chats/with/${userB.id}`).set(authA);
      expect(chat.status).toBe(200);
      const conversationId = chat.body.data.id as string;
      expect(await ack(a, 'joinConversation', conversationId)).toMatchObject({ ok: true });
      expect(await ack(b, 'joinConversation', conversationId)).toMatchObject({ ok: true });

      const typingAtB = event<{ userId: string; typing: boolean }>(b, 'typing');
      expect(await ack(a, 'typing', { conversationId, typing: true })).toMatchObject({ ok: true });
      expect(await typingAtB).toMatchObject({ userId: userA.id, typing: true });

      const messageAtB = event<{ body: string; senderId: string }>(b, 'chat:message');
      const sentMessage = await ack(a, 'sendMessage', { conversationId, body: 'QA A to B ✅', type: 'TEXT' });
      expect(sentMessage).toMatchObject({ ok: true });
      expect(await messageAtB).toMatchObject({ body: 'QA A to B ✅', senderId: userA.id });
      expect(await prisma.message.count({ where: { conversationId, senderId: userA.id } })).toBe(1);

      const seenAtA = event<{ readerId: string }>(a, 'chat:message:seen');
      expect((await request(app).post(`/api/chats/${conversationId}/read`).set(authB)).status).toBe(200);
      expect(await seenAtA).toMatchObject({ readerId: userB.id });

      const callAtB = event<{ callType: string; fromUserId: string }>(b, 'callInvitation');
      const call = await request(app).post('/api/calls/start').set(authA).send({ receiverId: userB.id, type: 'VOICE' });
      expect(call.status).toBe(200);
      expect(await callAtB).toMatchObject({ callType: 'VOICE', fromUserId: userA.id });
      expect(await prisma.callHistory.count({ where: { callerId: userA.id, receiverId: userB.id } })).toBe(1);
    } finally {
      await Promise.all([disconnect(a), disconnect(b)]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
});
