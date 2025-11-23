const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      firstName: true,
      lastName: true,
      role: true
    }
  });
  console.log('All users:');
  users.forEach(u => console.log('  -', u.email, '(' + u.role + ')'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
