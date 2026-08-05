import { prisma } from '../src/lib/prisma.js';
import {
  adminCreateEvent,
  adminDeleteEvent,
  getEventDetail,
  getUnifiedCalendar,
  joinEvent,
  listPublishedEvents,
  toggleInterest,
} from '../src/services/events.service.js';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT', accountStatus: 'ACTIVE', deletedAt: null },
  });
  if (!admin || !student) throw new Error('Need admin + student');

  const starts = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const created = await adminCreateEvent(
    {
      title: 'E2E Design Fest',
      description: 'Campus design showcase',
      category: 'CULTURAL',
      venue: 'Main Auditorium',
      organizer: 'AVICHIAN',
      capacity: 100,
      startsAt: starts.toISOString(),
      published: true,
      featured: true,
      visibility: 'ALL_STUDENTS',
    },
    admin.id,
    {},
  );
  console.log('created', created.id, created.title);

  const list = await listPublishedEvents(student.id, student.departmentId, {});
  if (!list.items.some((e) => e.id === created.id)) throw new Error('Event missing from list');
  console.log('list ok', list.items.length, 'featured', list.featured?.title);

  const join = await joinEvent(created.id, student.id, student.departmentId);
  console.log('join', join);
  if (join.registeredCount < 1) throw new Error('count not incremented');

  await toggleInterest(created.id, student.id, student.departmentId);
  const detail = await getEventDetail(created.id, student.id, student.departmentId);
  console.log('detail participants', detail.participants?.length, 'interested', detail.interested);

  const cal = await getUnifiedCalendar(
    student.id,
    student.departmentId,
    new Date().toISOString(),
    new Date(Date.now() + 30 * 86400000).toISOString(),
  );
  if (!cal.items.some((i) => i.id === created.id)) throw new Error('missing from calendar');
  console.log('calendar ok', cal.items.length);

  await adminDeleteEvent(created.id, admin.id, {});
  console.log('--- EVENTS E2E PASSED ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
