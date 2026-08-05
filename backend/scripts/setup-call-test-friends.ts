/**
 * Create two ACTIVE students who are friends, with known passwords (forcePasswordChange=false).
 * Run from backend/: npx tsx scripts/setup-call-test-friends.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { getIceConfig } from '../src/services/call.service.js';

const PASSWORD = 'CallTest@2026';

async function upsertStudent(regNo: string, name: string, mobile: string) {
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error('No department — seed departments first');

  const email = `${regNo.toLowerCase()}@avichi.edu`;
  const passwordHash = await hashPassword(PASSWORD);
  const mobileHash = hashValue(mobile);
  const mobileEnc = encryptField(mobile);

  const existing = await prisma.user.findUnique({ where: { regNo } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        forcePasswordChange: false,
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await prisma.profile.upsert({
      where: { userId: existing.id },
      update: { name },
      create: { userId: existing.id, name, year: 2, section: 'A' },
    });
    return existing.id;
  }

  const user = await prisma.user.create({
    data: {
      regNo,
      email,
      passwordHash,
      mobileHash,
      mobileEnc,
      role: 'STUDENT',
      departmentId: dept.id,
      accountStatus: 'ACTIVE',
      forcePasswordChange: false,
      profile: { create: { name, year: 2, section: 'A' } },
    },
  });
  return user.id;
}

async function main() {
  const aId = await upsertStudent('25CALL01', 'Call Tester A', '9000000001');
  const bId = await upsertStudent('25CALL02', 'Call Tester B', '9000000002');

  // Ensure mutual accepted friendship (FriendRequest model)
  const existing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId: aId, receiverId: bId },
        { senderId: bId, receiverId: aId },
      ],
    },
  });
  if (existing) {
    await prisma.friendRequest.update({
      where: { id: existing.id },
      data: { status: 'ACCEPTED' },
    });
  } else {
    await prisma.friendRequest.create({
      data: { senderId: aId, receiverId: bId, status: 'ACCEPTED' },
    });
  }

  const ice = getIceConfig();

  console.log('\n========== CALL TEST ACCOUNTS ==========');
  console.log('Open TWO browsers (or normal + Incognito).');
  console.log('');
  console.log('Student App:  http://localhost:5173/login');
  console.log('');
  console.log('Account A (Caller):');
  console.log('  Reg No:   25CALL01');
  console.log('  Password: CallTest@2026');
  console.log('');
  console.log('Account B (Callee):');
  console.log('  Reg No:   25CALL02');
  console.log('  Password: CallTest@2026');
  console.log('');
  console.log('Steps:');
  console.log('  1. Login A and B');
  console.log('  2. A → Chat or Profile of B → Voice / Video');
  console.log('  3. B accepts the top banner');
  console.log('  4. Allow mic/camera when prompted');
  console.log('  5. Test mute, camera, end call');
  console.log('');
  console.log('ICE mode:', ice.mediaMode, '| TURN:', ice.iceServers.some((s) => String(s.urls).includes('turn:')));
  console.log('LiveKit:', ice.livekitUrl ? ice.livekitUrl : 'not configured (using WebRTC P2P)');
  console.log('IDs:', { aId, bId });
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
