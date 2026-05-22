import { prisma } from "../src/utils/prisma.js";

async function main() {
  await prisma.systemConfig.upsert({
  where: {
    id: "global-config"
  },
  update: {},
  create: {
    id: "global-config",

    coinValuePaise: 10,
    redemptionCapPercent: 20,
    inactivityExpiryDays: 365,
    starterCoinsAmount: 200,
    dailyGamingCap: 200,
    brandEventActive: false,
    brandEventMultiplier: 1.0
  }
});
await prisma.earningRule.createMany({
  data: [

    {
      ruleKey: "DAILY_LOGIN",
      displayName: "Daily Login",
      category: "ENGAGEMENT",
      baseCoins: 5,
      multiplier: 1.0,
      dailyCap: 1,
      isActive: true
    },

    {
      ruleKey: "GAME_SESSION",
      displayName: "Game Session",
      category: "ENGAGEMENT",
      baseCoins: 10,
      multiplier: 1.0,
      dailyCap: 5,
      isActive: true
    },

    {
      ruleKey: "GAME_LEVEL_COMPLETED",
      displayName: "Game Level Completed",
      category: "ENGAGEMENT",
      baseCoins: 25,
      multiplier: 1.0,
      dailyCap: 8,
      isActive: true
    },

    {
      ruleKey: "PERFECT_LEVEL",
      displayName: "Perfect Level Reward",
      category: "ENGAGEMENT",
      baseCoins: 50,
      multiplier: 1.0,
      dailyCap: 5,
      isActive: true
    },

    {
      ruleKey: "HIGH_SCORE",
      displayName: "High Score Reward",
      category: "ENGAGEMENT",
      baseCoins: 25,
      multiplier: 1.0,
      dailyCap: 3,
      isActive: true
    },

    {
      ruleKey: "LMS_MODULE_COMPLETED",
      displayName: "LMS Module Completed",
      category: "LEARNING",
      baseCoins: 30,
      multiplier: 1.0,
      isActive: true
    },

    {
      ruleKey: "AMAZON_REVIEW",
      displayName: "Amazon Review",
      category: "ADVOCACY",
      baseCoins: 1000,
      multiplier: 1.0,
      requiresModeration: true,
      isActive: true
    }

  ],

  skipDuplicates: true
});
  }

main()
  .then(() => {
    console.log("Seeded successfully");
  })
  .catch(e => {
    console.error(e);
  })
  .finally(() => prisma.$disconnect());