import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();

// POST /shopify/link-user
router.post("/link-user", async (req, res) => {
  try {
    const { shopifyCustomerId, email } = req.body;

    if (!shopifyCustomerId || !email) {
      return res.status(400).json({
        error: "shopifyCustomerId and email are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email: String(email).toLowerCase(),
      },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: "No wallet user found with this email",
      });
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        shopifyCustomerId: String(shopifyCustomerId),
      },
      include: {
        wallet: true,
      },
    });

    return res.json({
      success: true,
      message: "Shopify customer linked with wallet user",
      userId: updatedUser.id,
      email: updatedUser.email,
      shopifyCustomerId: updatedUser.shopifyCustomerId,
      walletBalance: updatedUser.wallet?.balance || 0,
    });
  } catch (error) {
    console.error("SHOPIFY LINK USER ERROR:", error);

    return res.status(500).json({
      error: "Failed to link Shopify user",
      details: error.message,
    });
  }
});

export default router;