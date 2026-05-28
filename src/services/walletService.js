import { prisma } from '../utils/prisma.js';
import { io } from '../index.js';

export const creditCoins = async (
  userId,
  amount,
  description
) => {

  const wallet =
    await prisma.wallet.findUnique({
      where: { userId }
    });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const newBalance =
    Number(wallet.balance) +
    Number(amount);

  await prisma.$transaction([

    prisma.wallet.update({
      where: { userId },

      data: {
        balance: newBalance
      }
    }),

    prisma.transaction.create({
      data: {
        walletId: wallet.id,

        type: "EARN",

        amount: Number(amount),

        description,

        balanceAfter: newBalance
      }
    })

  ]);

  // REALTIME SOCKET UPDATE
  io.to(userId).emit(
    "wallet-updated",
    {
      balance: newBalance
    }
  );

  return newBalance;
};