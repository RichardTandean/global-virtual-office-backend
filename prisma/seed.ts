import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const adminPassword = await hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@lejel.com' },
    update: {},
    create: {
      name: 'Aldi (Admin)',
      email: 'admin@lejel.com',
      passwordHash: adminPassword,
      role: 'Admin',
    },
  });
  console.log('  Admin: admin@lejel.com');

  const koreaPassword = await hash('korea123', 12);
  await prisma.user.upsert({
    where: { email: 'korea@lejel.com' },
    update: {},
    create: {
      name: 'Duti (Korea Team)',
      email: 'korea@lejel.com',
      passwordHash: koreaPassword,
      role: 'KoreaTeam',
    },
  });
  console.log('  Korea Team: korea@lejel.com');

  const editorPassword = await hash('editor123', 12);
  await prisma.user.upsert({
    where: { email: 'editor@lejel.com' },
    update: {},
    create: {
      name: 'Budi (Editor)',
      email: 'editor@lejel.com',
      passwordHash: editorPassword,
      role: 'Editor',
    },
  });
  console.log('  Editor: editor@lejel.com');

  console.log('\nSeed selesai!');
  console.log('  Admin:     admin@lejel.com / admin123');
  console.log('  KoreaTeam: korea@lejel.com / korea123');
  console.log('  Editor:    editor@lejel.com / editor123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
