import { CallStatus, CallType } from '@prisma/client';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { areFriends, isBlockedEitherWay } from './friends.service.js';
import { createNotification } from './notification.service.js';
import { emitToUser } from '../socket.js';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Public ICE servers for browser RTCPeerConnection (STUN + optional Coturn TURN). */
export function getIceConfig(): {
  iceServers: IceServerConfig[];
  livekitUrl: string | null;
  mediaMode: 'livekit' | 'webrtc';
} {
  const iceServers: IceServerConfig[] = [];
  for (const raw of env.stunUrls.split(',')) {
    const urls = raw.trim();
    if (urls) iceServers.push({ urls });
  }
  if (env.turnUrls && env.turnUsername && env.turnCredential) {
    for (const raw of env.turnUrls.split(',')) {
      const urls = raw.trim();
      if (!urls) continue;
      iceServers.push({
        urls,
        username: env.turnUsername,
        credential: env.turnCredential,
      });
    }
  }
  if (iceServers.length === 0) {
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
  }
  const livekitReady = Boolean(env.livekitUrl && env.livekitApiKey && env.livekitApiSecret);
  return {
    iceServers,
    livekitUrl: livekitReady ? env.livekitUrl! : null,
    mediaMode: livekitReady ? 'livekit' : 'webrtc',
  };
}

/** LiveKit access token (HS256) — no extra package required. */
export function createLiveKitToken(params: {
  identity: string;
  name: string;
  roomName: string;
  ttlSeconds?: number;
}): string {
  if (!env.livekitApiKey || !env.livekitApiSecret) {
    throw new AppError(503, 'LiveKit is not configured on this server', 'LIVEKIT_DISABLED');
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.ttlSeconds ?? 60 * 60 * 2);
  const payload = {
    iss: env.livekitApiKey,
    sub: params.identity,
    name: params.name,
    nbf: now - 10,
    exp,
    video: {
      roomJoin: true,
      room: params.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  return jwt.sign(payload, env.livekitApiSecret, {
    algorithm: 'HS256',
    header: { alg: 'HS256', typ: 'JWT', kid: env.livekitApiKey },
  });
}

export async function issueCallLiveKitToken(userId: string, callId: string) {
  const call = await prisma.callHistory.findUnique({
    where: { id: callId },
    include: {
      caller: { include: { profile: { select: { name: true } } } },
      receiver: { include: { profile: { select: { name: true } } } },
    },
  });
  if (!call) throw new AppError(404, 'Call not found');
  if (call.callerId !== userId && call.receiverId !== userId) {
    throw new AppError(403, 'Not part of this call');
  }
  if (!call.roomName) throw new AppError(400, 'Call has no room');
  const isCaller = call.callerId === userId;
  const user = isCaller ? call.caller : call.receiver;
  const name = user.profile?.name ?? user.regNo;
  const token = createLiveKitToken({
    identity: userId,
    name,
    roomName: call.roomName,
  });
  return {
    token,
    url: env.livekitUrl,
    roomName: call.roomName,
    identity: userId,
  };
}

export async function startCall(
  callerId: string,
  receiverId: string,
  type: CallType,
) {
  if (callerId === receiverId) throw new AppError(400, 'Cannot call yourself');
  if (await isBlockedEitherWay(callerId, receiverId)) {
    throw new AppError(403, 'Cannot call — user is blocked');
  }
  if (!(await areFriends(callerId, receiverId))) {
    throw new AppError(403, 'You can only call accepted friends');
  }

  const busy = await prisma.callHistory.findFirst({
    where: {
      status: 'RINGING',
      startedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      OR: [
        { callerId: receiverId },
        { receiverId },
        { callerId },
        { receiverId: callerId },
      ],
    },
  });
  if (busy) {
    throw new AppError(409, 'User is busy on another call', 'CALL_BUSY');
  }

  const [receiver, caller] = await Promise.all([
    prisma.user.findFirst({
      where: { id: receiverId, role: { in: ['STUDENT', 'STAFF'] }, deletedAt: null },
      include: {
        profile: { select: { name: true, profilePhotoUrl: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.user.findFirst({
      where: { id: callerId, deletedAt: null },
      include: {
        profile: { select: { name: true, profilePhotoUrl: true } },
        department: { select: { name: true } },
      },
    }),
  ]);
  if (!receiver) throw new AppError(404, 'User not found');
  if (!caller) throw new AppError(404, 'Caller not found');

  const ice = getIceConfig();
  const roomName = `avichian-${type.toLowerCase()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const call = await prisma.callHistory.create({
    data: {
      callerId,
      receiverId,
      type,
      status: 'RINGING',
      roomName,
    },
  });

  const callerName = caller.profile?.name ?? caller.regNo;
  const fromDepartment = caller.department?.name ?? null;
  const invitePayload = {
    type: 'invite' as const,
    callId: call.id,
    callType: type,
    roomName,
    fromUserId: callerId,
    fromName: callerName,
    fromPhoto: caller.profile?.profilePhotoUrl ?? null,
    fromDepartment,
    mediaMode: ice.mediaMode,
  };

  // Dual-channel invite so UI never misses the ring
  emitToUser(receiverId, 'call:signal', {
    fromUserId: callerId,
    callId: call.id,
    type,
    signal: invitePayload,
  });
  emitToUser(receiverId, 'callInvitation', {
    fromUserId: callerId,
    callId: call.id,
    callType: type,
    roomName,
    fromName: callerName,
    fromPhoto: caller.profile?.profilePhotoUrl ?? null,
    fromDepartment,
    mediaMode: ice.mediaMode,
  });

  await createNotification({
    userId: receiverId,
    type: 'CALL_INCOMING',
    title: type === 'VIDEO' ? 'Incoming video call' : 'Incoming voice call',
    body: `${callerName} is calling`,
    data: {
      callId: call.id,
      callerId,
      type,
      roomName,
      mediaMode: ice.mediaMode,
    },
  });

  return {
    id: call.id,
    type: call.type,
    status: call.status,
    roomName: call.roomName,
    mediaMode: ice.mediaMode,
    livekitUrl: ice.livekitUrl,
    startedAt: call.startedAt,
    peer: {
      id: receiver.id,
      name: receiver.profile?.name ?? receiver.regNo,
      profilePhotoUrl: receiver.profile?.profilePhotoUrl ?? null,
    },
  };
}

export async function updateCallStatus(
  userId: string,
  callId: string,
  status: CallStatus,
  duration = 0,
) {
  const call = await prisma.callHistory.findUnique({ where: { id: callId } });
  if (!call) throw new AppError(404, 'Call not found');
  if (call.callerId !== userId && call.receiverId !== userId) {
    throw new AppError(403, 'Not part of this call');
  }

  // Don't regress a completed call
  if (call.status === 'COMPLETED' && status === 'RINGING') {
    return call;
  }

  const updated = await prisma.callHistory.update({
    where: { id: callId },
    data: {
      status,
      duration: Math.max(0, Math.floor(duration)),
      endedAt: status === 'RINGING' ? null : new Date(),
    },
  });

  if (status === 'MISSED' || status === 'REJECTED') {
    const peerId = userId === call.callerId ? call.receiverId : call.callerId;
    // Notify caller on reject/miss from receiver
    if (userId === call.receiverId) {
      await createNotification({
        userId: call.callerId,
        type: 'CALL_MISSED',
        title: status === 'MISSED' ? 'Missed call' : 'Call declined',
        body: call.type === 'VIDEO' ? 'Video call' : 'Voice call',
        data: { callId: call.id, receiverId: call.receiverId, type: call.type },
      });
    }
    emitToUser(peerId, 'call:signal', {
      fromUserId: userId,
      callId,
      signal: { type: status === 'REJECTED' ? 'reject' : 'hangup', reason: status },
    });
  }

  return updated;
}

export async function listCallHistory(userId: string) {
  const calls = await prisma.callHistory.findMany({
    where: {
      OR: [{ callerId: userId }, { receiverId: userId }],
    },
    include: {
      caller: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
      receiver: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return calls.map((c) => ({
    id: c.id,
    type: c.type,
    status: c.status,
    duration: c.duration,
    roomName: c.roomName,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    direction: c.callerId === userId ? 'outgoing' : 'incoming',
    peer:
      c.callerId === userId
        ? {
            id: c.receiver.id,
            name: c.receiver.profile?.name ?? c.receiver.regNo,
            profilePhotoUrl: c.receiver.profile?.profilePhotoUrl ?? null,
          }
        : {
            id: c.caller.id,
            name: c.caller.profile?.name ?? c.caller.regNo,
            profilePhotoUrl: c.caller.profile?.profilePhotoUrl ?? null,
          },
  }));
}
