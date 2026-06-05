import { prisma } from '../utils/prisma.js';

async function getDailyGamingCap() {
  const gameSessionRule = await prisma.earningRule.findUnique({
    where: {
      ruleKey: "GAME_SESSION",
    },
  });

  return Number(gameSessionRule?.dailyCap || 200);
}

export async function checkDailyCap(userId, amount) {
  const DAILY_CAP = await getDailyGamingCap();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const result = await prisma.transaction.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      wallet: {
        userId,
      },
      type: "EARN",
      sourcePlatform: "GAMES",
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  const totalEarnedToday = Number(result._sum.amount || 0);

  if (totalEarnedToday >= DAILY_CAP) {
    return {
      allowed: false,
      creditAmount: 0,
      dailyCap: DAILY_CAP,
      totalEarnedToday,
      remaining: 0,
    };
  }

  const remaining = DAILY_CAP - totalEarnedToday;
  const creditAmount = Math.min(Number(amount), remaining);

  return {
    allowed: true,
    creditAmount,
    dailyCap: DAILY_CAP,
    totalEarnedToday,
    remaining,
  };
}