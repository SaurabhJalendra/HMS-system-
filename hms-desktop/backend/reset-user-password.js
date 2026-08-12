/**
 * Reset a user password by username (server/DB access required).
 * Usage:
 *   node reset-user-password.js --list
 *   node reset-user-password.js <username> <newPassword>
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const [,, username, newPassword] = process.argv;

  if (username === '--list' || !username) {
    const users = await prisma.user.findMany({
      select: { username: true, fullName: true, role: true, isActive: true },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    console.log(`Users (${users.length}):`);
    for (const user of users) {
      console.log(`  ${user.username} | ${user.role} | ${user.fullName} | active=${user.isActive}`);
    }
    return;
  }

  if (!newPassword || newPassword.length < 6) {
    console.error('New password is required (min 6 characters).');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User not found: ${username}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, isActive: true },
  });

  console.log(`Password updated for ${user.username} (${user.role})`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
