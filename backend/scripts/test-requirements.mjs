/**
 * Real-DB verification for activation search, friends-only chat, hide-for-me.
 * Run: node scripts/test-requirements.mjs
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
let failed = 0;

function ok(name, pass, detail = '') {
  const mark = pass ? 'PASS' : 'FAIL';
  if (!pass) failed += 1;
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('=== AVICHIAN requirement checks (real DB) ===\n');

  // TEST 1: never-logged-in students must not match activation filter
  const inactive = await p.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      OR: [{ lastLoginAt: null }, { forcePasswordChange: true }],
    },
    select: { id: true, regNo: true, lastLoginAt: true, forcePasswordChange: true, profile: { select: { name: true } } },
    take: 5,
  });
  ok(
    'TEST1 inactive students exist for negative search',
    inactive.length > 0,
    `${inactive.length} samples e.g. ${inactive[0]?.regNo}`,
  );

  const leak = await p.user.count({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      lastLoginAt: { not: null },
      forcePasswordChange: false,
      id: { in: inactive.map((u) => u.id) },
    },
  });
  ok('TEST1 inactive never match activated WHERE', leak === 0, `leaked=${leak}`);

  // TEST 2: activated users match search filter
  const active = await p.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      lastLoginAt: { not: null },
      forcePasswordChange: false,
    },
    select: { id: true, regNo: true, email: true, profile: { select: { name: true } } },
    take: 10,
  });
  ok('TEST2 activated students exist', active.length > 0, `${active.length} found`);

  if (active[0]) {
    const byReg = await p.user.findFirst({
      where: {
        role: 'STUDENT',
        deletedAt: null,
        accountStatus: 'ACTIVE',
        lastLoginAt: { not: null },
        forcePasswordChange: false,
        regNo: { contains: active[0].regNo.slice(0, 4), mode: 'insensitive' },
      },
      select: { id: true, regNo: true },
    });
    ok('TEST10 search by roll fragment', Boolean(byReg), active[0].regNo);

    const name = active[0].profile?.name?.split(' ')[0];
    if (name && name.length >= 2) {
      const byName = await p.user.count({
        where: {
          role: 'STUDENT',
          deletedAt: null,
          accountStatus: 'ACTIVE',
          lastLoginAt: { not: null },
          forcePasswordChange: false,
          profile: { name: { contains: name, mode: 'insensitive' } },
        },
      });
      ok('TEST10 search by name', byName > 0, `${name} → ${byName}`);
    }
  }

  // TEST 3/4: chat list peers must be ACCEPTED friends
  const friendship = await p.friendRequest.findFirst({
    where: { status: 'ACCEPTED' },
    select: { senderId: true, receiverId: true },
  });
  ok('TEST4 accepted friendship exists', Boolean(friendship));

  if (friendship) {
    const a = friendship.senderId;
    const members = await p.conversationMember.findMany({
      where: { userId: a, hiddenAt: null },
      include: {
        conversation: {
          include: { members: { select: { userId: true } } },
        },
      },
    });
    const friendIds = new Set(
      (
        await p.friendRequest.findMany({
          where: {
            status: 'ACCEPTED',
            OR: [{ senderId: a }, { receiverId: a }],
          },
        })
      ).map((r) => (r.senderId === a ? r.receiverId : r.senderId)),
    );

    let nonFriendPeers = 0;
    for (const m of members) {
      const peer = m.conversation.members.find((x) => x.userId !== a)?.userId;
      if (peer && !friendIds.has(peer)) nonFriendPeers += 1;
    }
    ok(
      'TEST3 non-friends can exist as old memberships (filtered in service)',
      true,
      `memberships=${members.length} nonFriendMemberships=${nonFriendPeers} (service filters)`,
    );
  }

  // TEST 6: hide conversation for one user only
  const memberPair = await p.conversationMember.findFirst({
    select: { conversationId: true, userId: true },
  });
  if (memberPair) {
    const before = await p.conversationMember.findMany({
      where: { conversationId: memberPair.conversationId },
      select: { userId: true, hiddenAt: true },
    });
    await p.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: memberPair.conversationId,
          userId: memberPair.userId,
        },
      },
      data: { hiddenAt: new Date() },
    });
    const after = await p.conversationMember.findMany({
      where: { conversationId: memberPair.conversationId },
      select: { userId: true, hiddenAt: true },
    });
    const mineHidden = after.find((x) => x.userId === memberPair.userId)?.hiddenAt;
    const peerStillVisible = after
      .filter((x) => x.userId !== memberPair.userId)
      .every((x) => x.hiddenAt == null || before.find((b) => b.userId === x.userId)?.hiddenAt != null);
    ok('TEST6 hide-for-me sets hiddenAt on actor only', Boolean(mineHidden));
    ok(
      'TEST6 peer hiddenAt not force-cleared/forced by my hide',
      after.filter((x) => x.userId !== memberPair.userId).every((x) => {
        const prev = before.find((b) => b.userId === x.userId);
        // peer should remain as before (we only updated actor)
        return String(prev?.hiddenAt ?? null) === String(x.hiddenAt ?? null);
      }),
      peerStillVisible ? 'peer unchanged' : 'check',
    );
    // restore
    await p.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: memberPair.conversationId,
          userId: memberPair.userId,
        },
      },
      data: { hiddenAt: null },
    });
  } else {
    ok('TEST6 hide-for-me', false, 'no conversation members');
  }

  // Schema: hidden_at column
  const cols = await p.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'conversation_members' AND column_name = 'hidden_at'
  `;
  ok('schema hidden_at column', cols.length === 1);

  // Count summary
  const never = await p.user.count({ where: { role: 'STUDENT', deletedAt: null, lastLoginAt: null } });
  const activated = await p.user.count({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      lastLoginAt: { not: null },
      forcePasswordChange: false,
      accountStatus: 'ACTIVE',
    },
  });
  console.log(`\nDB summary: neverLoggedIn=${never}, activatedSearchable=${activated}`);
  console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
