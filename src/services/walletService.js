import { prisma } from '../utils/prisma.js';
// import { sendBalanceUpdate } from '../websocket/socket.js';

export const creditCoins = async (userId, amount, description) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId }
  });

  const newBalance = wallet.balance + amount;

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: newBalance }
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: "EARN",
        amount,
        description,
        balanceAfter: newBalance
      }
    })
  ]);
  sendBalanceUpdate(userId, newBalance);
  return newBalance;
};