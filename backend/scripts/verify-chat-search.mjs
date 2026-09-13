import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const cols = await p.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'conversation_members'
    ORDER BY ordinal_position
  `;
  console.log('conversation_members columns:', cols.map((c) => c.column_name).join(', '));

  const never = await p.user.count({
    where: { role: 'STUDENT', deletedAt: null, lastLoginAt: null },
  });
  const forcePw = await p.user.count({
    where: { role: 'STUDENT', deletedAt: null, forcePasswordChange: true },
  });
  const activated = await p.user.count({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      lastLoginAt: { not: null },
      forcePasswordChange: false,
      accountStatus: 'ACTIVE',
    },
  });
  console.log({ neverLoggedIn: never, forcePasswordChange: forcePw, activatedSearchable: activated });

  const sampleNever = await p.user.findFirst({
    where: { role: 'STUDENT', deletedAt: null, lastLoginAt: null },
    select: { id: true, regNo: true, email: true, forcePasswordChange: true, profile: { select: { name: true } } },
  });
  console.log('sampleNeverLoggedIn:', sampleNever);

  const sampleActive = await p.user.findFirst({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      lastLoginAt: { not: null },
      forcePasswordChange: false,
      accountStatus: 'ACTIVE',
    },
    select: { id: true, regNo: true, email: true, profile: { select: { name: true } } },
  });
  console.log('sampleActivated:', sampleActive);

  const friends = await p.friendRequest.count({ where: { status: 'ACCEPTED' } });
  const convos = await p.conversation.count();
  const hidden = await p.conversationMember.count({ where: { hiddenAt: { not: null } } });
  console.log({ acceptedFriendships: friends, conversations: convos, hiddenMemberships: hidden });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
