import { prisma } from "./src/lib/prisma.js";
const c = await prisma.campusEvent.count();
const p = await prisma.eventParticipant.count();
const pe = await prisma.personalEvent.count();
console.log(JSON.stringify({ campusEvents: c, participants: p, personal: pe }));
await prisma.$disconnect();
