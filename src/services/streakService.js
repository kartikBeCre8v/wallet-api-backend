import { prisma } from '../utils/prisma.js';

export async function updateLoginStreak(
  userId
) {

  let streak =
    await prisma.loginStreak.findUnique({
      where: {
        userId,
      },
    });

  if (!streak) {

    streak =
  await prisma.loginStreak.create({
    data: {
      userId,
      currentStreak: 1,
      lastLoginDate: new Date(),
    },
  });

await prisma.wallet.updateMany({
  where: {
    userId,
  },
  data: {
    streak_days: streak.currentStreak,
  },
});

return streak;
  }

  const now = new Date();

  const diff =
    now - new Date(streak.lastLoginDate);

  const hours =
    diff / (1000 * 60 * 60);

  let newStreak =
    streak.currentStreak;

  if (hours <= 24) {
    newStreak += 1;
  }

  if (hours > 48) {
    newStreak = 1;
  }

  const updatedStreak =
  await prisma.loginStreak.update({
    where: {
      userId,
    },

    data: {
      currentStreak: newStreak,
      lastLoginDate: now,
    },
  });

await prisma.wallet.updateMany({
  where: {
    userId,
  },
  data: {
    streak_days: updatedStreak.currentStreak,
  },
});

return updatedStreak;

}

export async function getLoginStreak(userId) {
  const streak = await prisma.loginStreak.findUnique({
    where: {
      userId,
    },
  });

  return {
    currentStreak: streak?.currentStreak || 0,
  };
}