import { prisma } from '../utils/prisma.js';

async function getSessionReward() {

  const rule =
    await prisma.earningRule.findUnique({
      where: {
        ruleKey: "GAME_SESSION"
      }
    });

  console.log(
    "SESSION RULE:",
    rule
  );

  return Number(
    rule?.baseCoins || 10
  );
}

export async function startSession(
  userId,
) {

  const session =
    await prisma.playSession.create({
      data: {
        userId,
        startedAt: new Date(),
      },
    });

  // AUTO REWARD AFTER 2 MINUTES
  setTimeout(async () => {

    try {

      const latestSession =
        await prisma.playSession.findUnique({
          where: {
            id: session.id
          }
        });

      // already rewarded
      if (
        !latestSession ||
        latestSession.rewarded
      ) {
        return;
      }

      // get latest reward config
      const sessionReward =
  await getSessionReward();
  console.log(
        "SESSION REWARD:",
        sessionReward
      );
      // today's start/end
const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

// count rewarded sessions today
const rewardedToday =
  await prisma.playSession.count({
    where: {
      userId,

      rewarded: true,

      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

// max 5/day
if (rewardedToday >= 5) {

  console.log(
    'Daily limit reached'
  );

  return;
}
      // get wallet
      const wallet =
        await prisma.wallet.findUnique({
          where: {
            userId
          }
        });

      if (!wallet) return;

      // update wallet
      const updatedWallet =
        await prisma.wallet.update({
          where: {
            id: wallet.id
          },

          data: {

            balance: {
              increment:
                sessionReward
            },

            lifetimeEarned: {
              increment:
                sessionReward
            },

            lastActivityAt:
              new Date()
          }
        });

      // transaction
      await prisma.transaction.create({
        data: {

          walletId:
            wallet.id,

          type: 'BONUS',

          amount:
            sessionReward,

          source:
            'platform_session',

          sourcePlatform:
            'GAMES',

          description:
            'Platform session reward',

          balanceAfter:
            updatedWallet.balance,
        },
      });

      // mark rewarded
      await prisma.playSession.update({
        where: {
          id: session.id
        },

        data: {
          rewarded: true
        }
      });

      console.log(
        `${sessionReward} coins auto rewarded`
      );

    } catch (error) {

      console.error(
        "AUTO SESSION REWARD ERROR:",
        error
      );

    }

  }, 120000); // 2 mins

  return session;
}

export async function endSession(
  sessionId
) {

  const session =
    await prisma.playSession.findUnique({
      where: {
        id: sessionId,
      },
    });

  if (!session) {
    throw new Error(
      'Session not found'
    );
  }

  // prevent duplicate reward
  if (session.endedAt) {
    return session;
  }

  const endedAt =
    new Date();

  const durationSeconds =
    Math.floor(
      (endedAt - session.startedAt)
      / 1000
    );

  // update session
  const updatedSession =
    await prisma.playSession.update({
      where: {
        id: sessionId,
      },

      data: {
        endedAt,
        durationSeconds,
      },
    });

  return updatedSession;
}