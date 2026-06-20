import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { creditCoins } from '../services/walletService.js';
import { prisma } from '../utils/prisma.js';
import { io } from "../index.js";
import { rewardUser } from '../services/rewardService.js';
import { checkDailyCap } from '../services/dailyCapService.js';

import {
  startSession,
  endSession
} from '../services/sessionService.js';

import {
  updateLoginStreak, getLoginStreak 
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

    // If wallet not found
    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found"
      });
    }

    res.json({
      balance: wallet.balance,
      lockedCoins: wallet.lockedCoins || 0,
      availableBalance: Number(wallet.balance || 0) - Number(wallet.lockedCoins || 0),

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

// router.post('/earn/event', authMiddleware, async (req, res) => {

//   try {

//     const { coins, description } = req.body;

//     const wallet = await prisma.wallet.findUnique({
//       where: { userId: req.user.id }
//     });

//     if (!wallet) {
//       return res.status(404).json({
//         error: "Wallet not found"
//       });
//     }

//     const newBalance = wallet.balance + Number(coins);

//     await prisma.$transaction([

//       prisma.wallet.update({
//         where: { userId: req.user.id },
//         data: {
//           balance: newBalance
//         }
//       }),

//       prisma.transaction.create({
//         data: {
//           walletId: wallet.id,
//           type: "EARN",
//           amount: Number(coins),
//           source: "game.completed",
//           sourcePlatform: "GAMES",
//           description: description || "Game reward",
//           balanceAfter: newBalance
//         }
//       })

//     ]);

//     res.json({
//       success: true,
//       newBalance
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       error: "Internal server error"
//     });

//   }

// });
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

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id }
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found"
      });
    }

    // const newBalance = Number(wallet.balance) + Number(amount);
const capCheck = await checkDailyCap(
  req.user.id,
  Number(amount)
);

if (!capCheck.allowed) {
  return res.json({
    success: false,
    capped: true,
    coinsCredited: 0,
    balance: Number(wallet.balance),
    newBalance: Number(wallet.balance),
    message: "Daily gaming cap reached",
    dailyCap: capCheck.dailyCap,
    totalEarnedToday: capCheck.totalEarnedToday,
    remaining: 0,
  });
}

const finalAmount = capCheck.creditAmount;

const newBalance = Number(wallet.balance) + Number(finalAmount);

    await prisma.$transaction([

      prisma.wallet.update({
        where: { userId: req.user.id },
        data: {
          balance: newBalance   // ✅ MUST BE NUMBER
        }
      }),

      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: "EARN",
          amount: Number(finalAmount),
          source: "GAME_COMPLETED",
          sourcePlatform: "GAMES",
          description: description || "Game reward",
          balanceAfter: newBalance,

          metadata: {
  game,
  level,
  score,
},
        }
      })

    ]);
    console.log(
  "EMITTING TO ROOM:",
  req.user.id
);
    io.to(req.user.id).emit(
  "walletUpdated",
  {
    balance: newBalance,
  }
);

   return res.json({
  success: true,
  capped: Number(finalAmount) < Number(amount),
  requestedCoins: Number(amount),
  coinsCredited: Number(finalAmount),
  balance: newBalance,
  newBalance,
  dailyCap: capCheck.dailyCap,
  totalEarnedToday: capCheck.totalEarnedToday + Number(finalAmount),
  remaining: Math.max(capCheck.remaining - Number(finalAmount), 0),
});

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Internal server error"
    });

  }

});

// =========================
// SPEND EVENT API
// =========================

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

      // INSUFFICIENT BALANCE
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

      // REALTIME UPDATE
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

      // FIND USER WALLET
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

      // GET TRANSACTIONS USING walletId
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

        return res.json({
          message: 'Already claimed today'
        });

      }
const rule = await prisma.earningRule.findUnique({
      where: { ruleKey: 'DAILY_LOGIN' }
    });

    const amount = rule?.isActive ? (rule.baseCoins ?? 5) : 5;
      await rewardUser({

        userId,

        amount,

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

let streakBonus = null;

if (Number(streak.currentStreak) === 7) {
  await rewardUser({
    userId,
    amount: 100,
    description: "7 day streak bonus",
    source: "STREAK_BONUS",
    sourcePlatform: "SYSTEM",
    referenceId: "7-day-streak",
    metadata: {
      streakDays: 7
    },
    idempotencyKey: `streak-bonus-${userId}-7`
  });

  streakBonus = {
    days: 7,
    coins: 100,
    message: "7 day streak bonus"
  };
}

if (Number(streak.currentStreak) === 30) {
  await rewardUser({
    userId,
    amount: 500,
    description: "30 day streak bonus",
    source: "STREAK_BONUS",
    sourcePlatform: "SYSTEM",
    referenceId: "30-day-streak",
    metadata: {
      streakDays: 30
    },
    idempotencyKey: `streak-bonus-${userId}-30`
  });

  streakBonus = {
    days: 30,
    coins: 500,
    message: "30 day streak bonus"
  };
}

return res.json({
  success: true,
  streak,
  streakBonus
});

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Daily login failed'
      });

    }

  }
);router.get(
  '/login-streak',
  authMiddleware,
  async (req, res) => {
    try {
      const streak = await getLoginStreak(req.user.id);

      return res.json({
        currentStreak: streak.currentStreak
      });

    } catch (err) {
      console.error("Get login streak failed:", err);

      return res.status(500).json({
        error: "Failed to fetch login streak"
      });
    }
  }
);

router.get(
  '/stats',
  authMiddleware,
  async (req, res) => {
    try {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const totalGamesPlayed = await prisma.playSession.count({
        where: { userId: req.user.id }
      });

      const gamesThisWeek = await prisma.playSession.count({
        where: {
          userId: req.user.id,
          createdAt: { gte: startOfWeek }
        }
      });

      return res.json({
        totalGamesPlayed,
        gamesThisWeek
      });

    } catch (err) {
      console.error("Get stats failed:", err);

      return res.status(500).json({
        error: "Failed to fetch stats"
      });
    }
  }
);

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

        return res.json({
          message: 'Already rewarded today'
        });

      }
      const rule = await prisma.earningRule.findUnique({
  where: { ruleKey: 'HIGH_SCORE' }
});
const amount = rule?.isActive ? (rule.baseCoins ?? 25) : 25;

      await rewardUser({

        userId,

        amount,

        description: 'High score reward',

        source: 'HIGH_SCORE',

        sourcePlatform: 'GAMES',

        referenceId: game,

        metadata: {
          game
        },

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

        return res.json({
          message: 'Already rewarded'
        });

      }
      const rule = await prisma.earningRule.findUnique({
  where: { ruleKey: 'PERFECT_LEVEL' }
});
const amount = rule?.isActive ? (rule.baseCoins ?? 50) : 50;

      await rewardUser({

        userId,

        amount,

        description: 'Perfect level reward',

        source: 'PERFECT_LEVEL',

        sourcePlatform: 'GAMES',

        referenceId,

        metadata: {
          game,
          level
        },

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

      return res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Perfect reward failed'
      });

    }

  }
);
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
        );

      return res.json(session);

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: 'Session start failed'
      });

    }

  }
);
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

        if (rewardedToday < 5) {

          await rewardUser({

            userId,

            amount: 10,

            description:
              'Play session reward',

            source:
              'PLAY_SESSION',

            sourcePlatform:
              'GAMES',

            referenceId:
              sessionId,

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
router.get('/all', async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      orderBy: { balance: 'desc' }
    });

    res.json(wallets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

router.get('/leaderboard/coins-per-hour', authMiddleware, async (req, res) => {

  try {

    const users = await prisma.user.findMany({

      include: {

        wallet: {
          include: {
            transactions: {
              where: {
                type: "EARN"
              }
            }
          }
        },

        PlaySession: true

      }

    });
const SMOOTHING_HOURS = 1.5;
const RATE_SOURCES = ["GAME_COMPLETED", "PLAY_SESSION"];
    const leaderboard = users.map(user => {

      const totalCoinsEarned =
        user.wallet?.transactions.reduce(
          (sum, tx) => sum + Number(tx.amount),
          0
        ) || 0;

        const rateCoins = user.wallet?.transactions
        .filter(tx => RATE_SOURCES.includes(tx.source))
        .reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

      const totalSecondsPlayed =
        user.PlaySession.reduce((sum, session) => {

          if (!session.endedAt) return sum;

          const duration =
            (
              new Date(session.endedAt)
              -
              new Date(session.startedAt)
            ) / 1000;

          return sum + duration;

        }, 0);


      const totalHoursPlayed =
        totalSecondsPlayed / 3600;


      // const coinsPerHour =
      //   totalHoursPlayed > 0
      //     ? totalCoinsEarned / totalHoursPlayed
      //     : 0;

const coinsPerHour =
  rateCoins / (totalHoursPlayed + SMOOTHING_HOURS);

      return {
        userId: user.id,
        name:
          user.childName ||
          user.email,

        totalCoinsEarned,

        totalHoursPlayed:
          Number(totalHoursPlayed.toFixed(2)),

        coinsPerHour:
          Number(coinsPerHour.toFixed(2))

      };

    }).filter(p => p.totalHoursPlayed >= 1);


    leaderboard.sort(
      (a, b) =>
        b.coinsPerHour - a.coinsPerHour
    );


    return res.json(leaderboard);

  }

  catch (err) {

    console.error(err);

    return res.status(500).json({
      error: "Leaderboard failed"
    });

  }

});

router.get('/leaderboard/weekly', authMiddleware, async (req, res) => {

  try {

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const users = await prisma.user.findMany({

      include: {

        wallet: {
          include: {
            transactions: {
              where: {
                type: "EARN",
                createdAt: { gte: startOfWeek }
              }
            }
          }
        },

        PlaySession: {
          where: {
            startedAt: { gte: startOfWeek }
          }
        }

      }

    });

    const SMOOTHING_HOURS = 1.5;
    const RATE_SOURCES = ["GAME_COMPLETED", "PLAY_SESSION"];

    const leaderboard = users.map(user => {

      const totalCoinsEarned =
        user.wallet?.transactions.reduce(
          (sum, tx) => sum + Number(tx.amount),
          0
        ) || 0;

      const rateCoins = user.wallet?.transactions
        .filter(tx => RATE_SOURCES.includes(tx.source))
        .reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

      const totalSecondsPlayed =
        user.PlaySession.reduce((sum, session) => {
          if (!session.endedAt) return sum;
          const duration =
            (new Date(session.endedAt) - new Date(session.startedAt)) / 1000;
          return sum + duration;
        }, 0);

      const totalHoursPlayed = totalSecondsPlayed / 3600;

      const coinsPerHour =
        rateCoins / (totalHoursPlayed + SMOOTHING_HOURS);

      return {
        userId: user.id,
        name: user.childName || user.email,
        totalCoinsEarned,
        totalHoursPlayed: Number(totalHoursPlayed.toFixed(2)),
        coinsPerHour: Number(coinsPerHour.toFixed(2))
      };

    }).filter(p => p.totalCoinsEarned > 0);

    leaderboard.sort((a, b) => b.coinsPerHour - a.coinsPerHour);

    return res.json(leaderboard);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Weekly leaderboard failed" });
  }

});

// GET /wallet/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { childName: true, childAge: true, parentPhone: true, email: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /wallet/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { childName, childAge, parentPhone } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        childName: childName || '',
        childAge: Number(childAge) || 0,
        parentPhone: parentPhone || '',
      },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
export default router;
