import { prisma } from '../utils/prisma.js';

export const ensureWallet = async (userId) => {

  let wallet = await prisma.wallet.findUnique({
    where: { userId }
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 0
      }
    });
  }

  return wallet;
};