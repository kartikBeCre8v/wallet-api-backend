import { prisma } from '../utils/prisma.js';

import { checkDailyCap } from "./dailyCapService.js";

import { io } from "../index.js";

export async function rewardUser({
  userId,
  amount,
  description,
  source,
  sourcePlatform,
  referenceId,
  metadata,
  idempotencyKey,
}) {

  // =========================
  // 1. IDEMPOTENCY CHECK
  // =========================

  const existing = await prisma.transaction.findUnique({
    where: {
      idempotencyKey,
    },
  });

  if (existing) {
    return existing;
  }

  // =========================
  // 2. DAILY CAP CHECK
  // =========================

  const allowed = await checkDailyCap(
    userId,
    amount
  );

  if (!allowed) {
    throw new Error(
      "Daily earning limit reached"
    );
  }

  // =========================
  // 3. GET WALLET
  // =========================

  const wallet = await prisma.wallet.findUnique({
    where: {
      userId,
    },
  });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  // =========================
  // 4. UPDATE WALLET
  // =========================

  const updatedWallet =
    await prisma.wallet.update({
      where: {
        id: wallet.id,
      },

      data: {
        balance: {
          increment: amount,
        },

        lifetimeEarned: {
          increment: amount,
        },

        lastActivityAt: new Date(),
      },
    });

  // =========================
  // 5. CREATE TRANSACTION
  // =========================

  const transaction =
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,

        type: "EARN",

        amount,

        source,

        sourcePlatform,

        referenceId,

        description,

        metadata,

        balanceAfter:
          updatedWallet.balance,

        idempotencyKey,
      },
    });

  // =========================
  // 6. SOCKET EMIT
  // =========================

  io.to(userId).emit(
    "walletUpdated",
    {
      balance: updatedWallet.balance,
    }
  );

  return transaction;
}