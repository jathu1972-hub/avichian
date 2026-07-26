import { CallStatus, CallType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { areFriends } from './friends.service.js';
import { createNotification } from './notification.service.js';

export async function startCall(
  callerId: string,
  receiverId: string,
  type: CallType,
) {
  if (callerId === receiverId) throw new AppError(400, 'Cannot call yourself');
  if (!(await areFriends(callerId, receiverId))) {
    throw new AppError(403, 'You can only call accepted friends');
  }

  const receiver = await prisma.user.findFirst({
    where: { id: receiverId, role: 'STUDENT', deletedAt: null },
  });
  if (!receiver) throw new AppError(404, 'Student not found');

  const roomName = `avichian-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`;

  const call = await prisma.callHistory.create({
    data: {
      callerId,
      receiverId,
      type,
      status: 'RINGING',
      roomName,
    },
  });

  await createNotification({
    userId: receiverId,
    type: 'CALL_INCOMING',
    title: type === 'VIDEO' ? 'Incoming video call' : 'Incoming voice call',
    body: 'Tap to open chat and answer',
    data: { callId: call.id, callerId, type, roomName },
  });

  return {
    id: call.id,
    type: call.type,
    status: call.status,
    roomName: call.roomName,
    startedAt: call.startedAt,
    // LiveKit JWT would be issued here when LIVEKIT_* env is configured
    livekitUrl: process.env.LIVEKIT_URL ?? null,
    livekitToken: null as string | null,
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

  const updated = await prisma.callHistory.update({
    where: { id: callId },
    data: {
      status,
      duration,
      endedAt: status === 'RINGING' ? null : new Date(),
    },
  });

  if (status === 'MISSED' || status === 'REJECTED') {
    await createNotification({
      userId: call.callerId,
      type: 'CALL_MISSED',
      title: status === 'MISSED' ? 'Missed call' : 'Call declined',
      body: call.type === 'VIDEO' ? 'Video call' : 'Voice call',
      data: { callId: call.id, receiverId: call.receiverId, type: call.type },
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
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    direction: c.callerId === userId ? 'outgoing' : 'incoming',
    peer: c.callerId === userId
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
