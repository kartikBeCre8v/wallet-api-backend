import { prisma } from '../utils/prisma.js';

async function getDailyCap() {

  const config = await prisma.systemConfig.findUnique({
    where: {
      key: "DAILY_CAP"
    }
  });

  return Number(config?.value || 200);

}

export async function checkDailyCap(userId, amount, source) {

  if (source !== "GAME_COMPLETED") {
    return {
      allowed: true,
      remaining: amount,
    };
  }

  const DAILY_CAP = await getDailyCap();
  console.log("DAILY CAP =", DAILY_CAP);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result = await prisma.transaction.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      wallet: { userId },
      type: "EARN",
      source: "GAME_COMPLETED",
      sourcePlatform: "GAMES",
      createdAt: {
        gte: todayStart,
      },
    },
  });

  const totalEarnedToday = result._sum.amount || 0;

  

if (totalEarnedToday >= DAILY_CAP) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  const remaining = DAILY_CAP - totalEarnedToday;

  if (amount > remaining) {
    return {
      allowed: true,
      remaining,
    };
  }

  return {
    allowed: true,
    remaining: amount,
  };
}