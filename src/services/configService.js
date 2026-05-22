import { prisma } from "../utils/prisma.js";

export async function getConfig(key) {
  const config = await prisma.systemConfig.findUnique({
    where: { key },
  });

  if (!config) return null;

  return Number(config.value);
}