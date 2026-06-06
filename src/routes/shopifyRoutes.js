import express from "express";
import { prisma } from "../utils/prisma.js";
import { createShopifyDiscountCode } from "../services/shopifyService.js";
import crypto from "crypto";

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

// POST /shopify/redeem/quote
router.post("/redeem/quote", async (req, res) => {
  try {
    const { email, cartTotalPaise } = req.body;

    if (!email || !cartTotalPaise) {
      return res.status(400).json({
        error: "email and cartTotalPaise are required",
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

    if (!user || !user.wallet) {
      return res.status(404).json({
        error: "Wallet user not found",
      });
    }

    const config = await prisma.systemConfig.findFirst();

    const coinValuePaise = Number(config?.coinValuePaise || 10);
    const redemptionCapPercent = Number(config?.redemptionCapPercent || 20);

    const maxDiscountPaise = Math.floor(
      (Number(cartTotalPaise) * redemptionCapPercent) / 100
    );

    const maxRedeemableCoins = Math.floor(
      maxDiscountPaise / coinValuePaise
    );

    const recommendedRedeem = Math.min(
      Number(user.wallet.balance || 0),
      maxRedeemableCoins
    );

    res.json({
      userBalance: Number(user.wallet.balance || 0),
      coinValuePaise,
      redemptionCapPercent,
      maxRedeemableCoins,
      recommendedRedeem,
      discountPaise: recommendedRedeem * coinValuePaise,
      rupeeDiscount: (recommendedRedeem * coinValuePaise) / 100,
    });

  } catch (error) {
    console.error("Shopify quote error:", error);
    res.status(500).json({
      error: "Shopify quote failed",
      details: error.message,
    });
  }
});
// POST /shopify/redeem/generate-code
router.post("/redeem/generate-code", async (req, res) => {
  try {
    const { email, coinAmount, cartTotalPaise, cartId } = req.body;

    if (!email || !coinAmount || !cartTotalPaise) {
      return res.status(400).json({
        error: "email, coinAmount and cartTotalPaise are required",
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

    if (!user || !user.wallet) {
      return res.status(404).json({
        error: "Wallet user not found",
      });
    }

    if (Number(coinAmount) > Number(user.wallet.balance || 0)) {
      return res.status(400).json({
        error: "Not enough coins",
      });
    }

    const config = await prisma.systemConfig.findFirst();

    const coinValuePaise = Number(config?.coinValuePaise || 10);
    const redemptionCapPercent = Number(config?.redemptionCapPercent || 20);

    const maxDiscountPaise = Math.floor(
      (Number(cartTotalPaise) * redemptionCapPercent) / 100
    );

    const maxCoinsByCart = Math.floor(maxDiscountPaise / coinValuePaise);

    if (Number(coinAmount) > maxCoinsByCart) {
      return res.status(400).json({
        error: "Coin amount exceeds redemption limit",
      });
    }

    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = `CC-${coinAmount}-${random}`;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const discountPaise = Number(coinAmount) * coinValuePaise;

    const shopifyDiscountId = await createShopifyDiscountCode({
      code,
      discountPaise,
      expiresAt,
    });

    const redemption = await prisma.redemption.create({
      data: {
        userId: user.id,
        shopifyDiscountCode: code,
        shopifyDiscountId,
        coinAmount: Number(coinAmount),
        discountPaise,
        status: "PENDING",
        cartId: cartId || null,
        expiresAt,
      },
    });

    res.json({
      success: true,
      redemptionId: redemption.id,
      shopifyDiscountCode: code,
      coinAmount: redemption.coinAmount,
      discountPaise: redemption.discountPaise,
      rupeeValue: redemption.discountPaise / 100,
      expiresAt: redemption.expiresAt,
    });

  } catch (error) {
    console.error("Shopify generate code error:", error);
    res.status(500).json({
      error: "Shopify generate code failed",
      details: error.message,
    });
  }
});

export default router;