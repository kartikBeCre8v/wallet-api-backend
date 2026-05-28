import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { creditCoins } from '../services/walletService.js';
import { prisma } from '../utils/prisma.js';
import { io } from "../index.js";
import { rewardUser } from '../services/rewardService.js';
import { getConfig } from '../services/configService.js';
import {
  startSession,
  endSession
} from '../services/sessionService.js';

import {
  updateLoginStreak
} from '../services/streakService.js';

const router = express.Router();


// =========================
// GET WALLET BALANCE
// =========================

router.get('/balance', authMiddleware, async (req, res) => {

  try {

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id }
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found"
      });
    }

    res.json({
      balance: wallet.balance
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });

  }

});


// =========================
// SIMPLE EARN API
// =========================

router.post('/earn', authMiddleware, async (req, res) => {

  try {

    const { amount } = req.body;

    const newBalance = await creditCoins(
      req.user.id,
      amount,
      "Game reward"
    );

    res.json({
      success: true,
      newBalance
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });

  }

});


// =========================
// EARN EVENT API
// =========================

router.post('/earn/event', authMiddleware, async (req, res) => {
  try {

    const {
      amount,
      description,
      game,
      level,
      score,
      streak,
      mode,
      difficulty,
      completedAt,
    } = req.body;

    if (!amount) {
      return res.status(400).json({
        error: "Amount is required"
      });
    }

    const rewardAmount = Number(amount);

    const result = await rewardUser({
      userId: req.user.id,
      amount: rewardAmount,
      description: description || "Game reward",
      source: "GAME_COMPLETED",
      sourcePlatform: "GAMES",
      referenceId: `${game}-${Date.now()}`,
      metadata: {
        game,
        level,
        score,
        streak,
        mode,
        difficulty,
        completedAt,
      },
      idempotencyKey: `${req.user.id}-${game}-${Date.now()}`
    });

    // ✅ FIX: use result (not rewardResult), use req.user.id (not userId)
    io.to(req.user.id).emit("walletUpdated", {
      balance: result.balance
    });

    return res.json(result);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.post(
  '/spend/event',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        amount,
        description,
        game
      } = req.body;

      if (!amount) {

        return res.status(400).json({
          error: "Amount is required"
        });

      }

      const wallet =
        await prisma.wallet.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!wallet) {

        return res.status(404).json({
          error: "Wallet not found"
        });

      }

      if (
        Number(wallet.balance) <
        Number(amount)
      ) {

        return res.status(400).json({
          error: "Not enough coins"
        });

      }

      const newBalance =
        Number(wallet.balance) -
        Number(amount);

      await prisma.$transaction([

        prisma.wallet.update({
          where: {
            userId: req.user.id
          },

          data: {
            balance: newBalance
          }
        }),

        prisma.transaction.create({
          data: {
            walletId: wallet.id,

            type: "SPEND",

            amount: Number(amount),

            source: "game.skip",

            sourcePlatform: "GAMES",

            description:
              description ||
              "Coins spent",

            balanceAfter:
              newBalance,

            metadata: {
              game
            }
          }
        })

      ]);

      io.to(req.user.id).emit(
        "walletUpdated",
        {
          balance: newBalance
        }
      );

      return res.json({
        success: true,
        newBalance
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Internal server error"
      });
    }
  }
);

router.get(
  "/transactions",
  authMiddleware,
  async (req, res) => {
    try {

      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: req.user.id,
        },
      });

      if (!wallet) {
        return res.status(404).json({
          error: "Wallet not found",
        });
      }

      const transactions = await prisma.transaction.findMany({
        where: {
          walletId: wallet.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(transactions);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Internal server error",
      });

    }
  }
);

// =========================
// DAILY LOGIN
// =========================

router.post(
  '/daily-login',
  authMiddleware,
  async (req, res) => {

    try {

      const userId = req.user.id;

      const today = new Date();

      today.setHours(0, 0, 0, 0);

      const existing =
        await prisma.dailyRewardTracker.findFirst({
          where: {
            userId,
            rewardType: 'DAILY_LOGIN',
            rewardDate: {
              gte: today
            }
          }
        });

      if (existing) {
        // ✅ FIX: no rewardResult here, just return message
        return res.json({
          message: 'Already claimed today'
        });
      }

      const rule =
        await prisma.earningRule.findFirst({
          where: {
            ruleKey: "DAILY_LOGIN"
          }
        });

      const rewardAmount =
        Number(rule?.baseCoins || 10);

      console.log("DAILY LOGIN REWARD:", rewardAmount);

      const rewardResult = await rewardUser({
        userId,
        amount: rewardAmount,
        description: 'Daily login reward',
        source: 'DAILY_LOGIN',
        sourcePlatform: 'SYSTEM',
        referenceId: today.toDateString(),
        metadata: {},
        idempotencyKey:
          `daily-login-${userId}-${today.toDateString()}`
      });

      await prisma.dailyRewardTracker.create({
        data: {
          userId,
          rewardType: 'DAILY_LOGIN',
          rewardDate: new Date()
        }
      });

      const streak =
        await updateLoginStreak(userId);

      io.to(userId).emit("walletUpdated", {
        balance: rewardResult.balance
      });

      return res.json({
        success: true,
        streak,
        balance: rewardResult.balance
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Daily login failed'
      });

    }

  }
);

// =========================
// HIGH SCORE
// =========================

router.post(
  '/high-score',
  authMiddleware,
  async (req, res) => {

    try {

      const userId = req.user.id;

      const { game } = req.body;

      const today = new Date();

      today.setHours(0, 0, 0, 0);

      const existing =
        await prisma.dailyRewardTracker.findFirst({
          where: {
            userId,
            rewardType: 'HIGH_SCORE',
            referenceId: game,
            rewardDate: {
              gte: today
            }
          }
        });

      if (existing) {
        // ✅ FIX: no rewardResult here, just return message
        return res.json({
          message: 'Already rewarded today'
        });
      }

      const rewardResult = await rewardUser({
        userId,
        amount: 25,
        description: 'High score reward',
        source: 'HIGH_SCORE',
        sourcePlatform: 'GAMES',
        referenceId: game,
        metadata: { game },
        idempotencyKey:
          `high-score-${userId}-${game}-${today.toDateString()}`
      });

      await prisma.dailyRewardTracker.create({
        data: {
          userId,
          rewardType: 'HIGH_SCORE',
          rewardDate: new Date(),
          referenceId: game
        }
      });

      io.to(userId).emit("walletUpdated", {
        balance: rewardResult.balance
      });

      return res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'High score reward failed'
      });

    }

  }
);

// =========================
// PERFECT LEVEL
// =========================

router.post(
  '/perfect-level',
  authMiddleware,
  async (req, res) => {

    try {

      const userId = req.user.id;

      const {
        game,
        level
      } = req.body;

      const referenceId =
        `${game}-level-${level}`;

      const existing =
        await prisma.dailyRewardTracker.findFirst({
          where: {
            userId,
            rewardType: 'PERFECT_LEVEL',
            referenceId
          }
        });

      if (existing) {
        // ✅ FIX: no rewardResult here, just return message
        return res.json({
          message: 'Already rewarded'
        });
      }

      const rule =
        await prisma.earningRule.findFirst({
          where: {
            ruleKey: "PERFECT_LEVEL"
          }
        });

      const rewardAmount =
        Number(rule?.baseCoins || 10);

      const rewardResult = await rewardUser({
        userId,
        amount: rewardAmount,
        description: 'Perfect level reward',
        source: 'PERFECT_LEVEL',
        sourcePlatform: 'GAMES',
        referenceId,
        metadata: { game, level },
        idempotencyKey:
          `perfect-${userId}-${referenceId}`
      });

      await prisma.dailyRewardTracker.create({
        data: {
          userId,
          rewardType: 'PERFECT_LEVEL',
          rewardDate: new Date(),
          referenceId
        }
      });

      io.to(userId).emit("walletUpdated", {
        balance: rewardResult.balance
      });

      return res.json({
        success: true,
        balance: rewardResult.balance
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Perfect reward failed'
      });

    }

  }
);

// =========================
// SESSION START
// =========================

router.post(
  '/session/start',
  authMiddleware,
  async (req, res) => {

    try {

      const userId = req.user.id;

      const { game } = req.body;

      const session =
        await startSession(
          userId,
          game
        );

      // ✅ FIX: session/start ke paas koi reward nahi hota, emit mat karo
      return res.json(session);

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Session start failed'
      });

    }

  }
);

// =========================
// SESSION END
// =========================

router.post(
  '/session/end',
  authMiddleware,
  async (req, res) => {

    try {

      const userId = req.user.id;

      const { sessionId } = req.body;

      const session =
        await endSession(sessionId);

      const start =
        new Date(session.startedAt);

      const end =
        new Date();

      const minutes =
        (end - start) /
        (1000 * 60);

      if (minutes >= 2) {

        const today =
          new Date();

        today.setHours(0,0,0,0);

        const rewardedToday =
          await prisma.playSession.count({
            where: {
              userId,
              rewarded: true,
              createdAt: {
                gte: today
              }
            }
          });

        const rule =
          await prisma.earningRule.findFirst({
            where: {
              ruleKey: "GAME_SESSION"
            }
          });

        const rewardAmount =
          Number(rule?.baseCoins || 10);

        if (rewardedToday < 5) {

          const rewardResult = await rewardUser({
            userId,
            amount: rewardAmount,
            description: 'Play session reward',
            source: 'PLAY_SESSION',
            sourcePlatform: 'GAMES',
            referenceId: sessionId,
            metadata: {},
            idempotencyKey:
              `session-${sessionId}`
          });

          await prisma.playSession.update({
            where: {
              id: sessionId
            },
            data: {
              rewarded: true
            }
          });

          // ✅ FIX: emit only inside the if block where rewardResult exists
          io.to(userId).emit("walletUpdated", {
            balance: rewardResult.balance
          });

        }

      }

      return res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Session end failed'
      });

    }

  }
);

export default router;