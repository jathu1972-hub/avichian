/**
 * Ensure at least one published campus event exists for local demos.
 * npx tsx scripts/seed-demo-event.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { adminCreateEvent } from '../src/services/events.service.js';

async function main() {
  const existing = await prisma.campusEvent.count({
    where: { published: true, status: { notIn: ['CANCELLED', 'HIDDEN', 'DRAFT'] } },
  });
  if (existing > 0) {
    console.log(`Already have ${existing} published event(s).`);
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!admin) throw new Error('No super admin');

  const starts = new Date();
  starts.setDate(starts.getDate() + 7);
  starts.setHours(10, 0, 0, 0);
  const ends = new Date(starts);
  ends.setHours(16, 0, 0, 0);

  const ev = await adminCreateEvent(
    {
      title: 'AVICHIAN Campus Open Day',
      description:
        'Welcome day for Visual Communication students — tours, workshops, and meet the faculty.',
      category: 'COLLEGE',
      venue: 'Main Auditorium',
      organizer: 'AVICHIAN · Student Affairs',
      speaker: 'Principal & Department Heads',
      capacity: 200,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      published: true,
      featured: true,
      visibility: 'ALL_STUDENTS',
      status: 'UPCOMING',
    },
    admin.id,
    {},
  );
  console.log('Seeded event:', ev.id, ev.title);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
