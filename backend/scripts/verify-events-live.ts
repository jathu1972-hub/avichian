import { prisma } from "../src/lib/prisma.js";
import { listPublishedEvents, getUnifiedCalendar, joinEvent } from "../src/services/events.service.js";

const student = await prisma.user.findFirst({
  where: { role: "STUDENT", accountStatus: "ACTIVE", deletedAt: null },
});
if (!student) throw new Error("no student");
const list = await listPublishedEvents(student.id, student.departmentId, {});
console.log(JSON.stringify({
  count: list.items.length,
  featured: list.featured?.title ?? null,
  titles: list.items.map((e) => e.title),
}, null, 2));
if (list.items[0]) {
  const j = await joinEvent(list.items[0].id, student.id, student.departmentId);
  console.log("join", j);
}
const from = new Date();
from.setDate(1);
const to = new Date();
to.setMonth(to.getMonth() + 2);
const cal = await getUnifiedCalendar(
  student.id,
  student.departmentId,
  from.toISOString(),
  to.toISOString(),
);
console.log("calendar", cal.items.map((i) => ({ title: i.title, type: i.type, start: i.start.slice(0, 10) })));
await prisma.$disconnect();
