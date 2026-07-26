import { prisma } from '../src/lib/prisma.js';

const result = await prisma.story.updateMany({
  where: {
    mediaType: 'IMAGE',
    OR: [
      { mediaUrl: { contains: 'story-video' } },
      { mediaUrl: { contains: 'post-video' } },
      { mediaUrl: { contains: '.mp4' } },
      { mediaUrl: { contains: '.webm' } },
      { mediaUrl: { contains: '.mov' } },
      { mediaUrl: { contains: '.m4v' } },
    ],
  },
  data: { mediaType: 'VIDEO' },
});

console.log('Backfilled VIDEO mediaType for', result.count, 'stories');
await prisma.$disconnect();
