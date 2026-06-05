import express from "express";
import crypto from "crypto";
import authMiddleware from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";
import { createShopifyDiscountCode } from "../services/shopifyService.js";
import { io } from "../index.js";

const router = express.Router();

function generateCode(coinAmount) {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CC-${coinAmount}-${random}`;
}

async function getSystemConfig() {
  const config = await prisma.systemConfig.findFirst();

  return {
    coinValuePaise: Number(config?.coinValuePaise || 10),
    redemptionCapPercent: Number(config?.redemptionCapPercent || 20),
  };
}

async function getPendingCoins(userId) {
  const pending = await prisma.redemption.aggregate({
    where: {
      userId,
      status: "PENDING",
      expiresAt: {
        gt: new Date(),
      },
    },
    _sum: {
      coinAmount: true,
    },
  });

  return Number(pending._sum.coinAmount || 0);
}

// POST /redeem/quote
router.post("/quote", authMiddleware, async (req, res) => {
  try {
    const { cartTotalPaise } = req.body;

    if (!cartTotalPaise) {
      return res.status(400).json({
        error: "cartTotalPaise is required",
      });
    }

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

    const { coinValuePaise, redemptionCapPercent } = await getSystemConfig();

    const pendingCoins = await getPendingCoins(req.user.id);
    const availableCoins = Math.max(Number(wallet.balance || 0) - pendingCoins, 0);

    const maxDiscountPaise = Math.floor(
      (Number(cartTotalPaise) * redemptionCapPercent) / 100
    );

    const maxRedeemableCoinsByCart = Math.floor(
      maxDiscountPaise / coinValuePaise
    );

    const recommendedRedeem = Math.min(
      availableCoins,
      maxRedeemableCoinsByCart
    );

    const finalRedeem =
      recommendedRedeem >= 100 ? recommendedRedeem : 0;

    return res.json({
      userBalance: Number(wallet.balance || 0),
      pendingCoins,
      availableCoins,
      coinValuePaise,
      redemptionCapPercent,
      maxRedeemableCoins: maxRedeemableCoinsByCart,
      recommendedRedeem: finalRedeem,
      discountPaise: finalRedeem * coinValuePaise,
      rupeeDiscount: (finalRedeem * coinValuePaise) / 100,
    });
  } catch (error) {
    console.error("Quote error:", error);

    return res.status(500).json({
      error: "Redemption quote failed",
    });
  }
});

// POST /redeem/generate-code
router.post("/generate-code", authMiddleware, async (req, res) => {
  try {
    const { coinAmount, cartTotalPaise, cartId } = req.body;

    if (!coinAmount || !cartTotalPaise) {
      return res.status(400).json({
        error: "coinAmount and cartTotalPaise are required",
      });
    }

    if (Number(coinAmount) < 100) {
      return res.status(400).json({
        error: "Minimum redemption is 100 coins",
      });
    }

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

    const { coinValuePaise, redemptionCapPercent } = await getSystemConfig();

    const pendingCoins = await getPendingCoins(req.user.id);
    const availableCoins = Math.max(Number(wallet.balance || 0) - pendingCoins, 0);

    const maxDiscountPaise = Math.floor(
      (Number(cartTotalPaise) * redemptionCapPercent) / 100
    );

    const maxCoinsByCart = Math.floor(maxDiscountPaise / coinValuePaise);

    if (Number(coinAmount) > availableCoins) {
      return res.status(400).json({
        error: "Not enough available coins",
      });
    }

    if (Number(coinAmount) > maxCoinsByCart) {
      return res.status(400).json({
        error: "Coin amount exceeds 20% cart redemption cap",
      });
    }

    const code = generateCode(coinAmount);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const discountPaise = Number(coinAmount) * coinValuePaise;

    const shopifyDiscountId = await createShopifyDiscountCode({
      code,
      discountPaise,
      expiresAt,
    });

    const redemption = await prisma.redemption.create({
      data: {
        userId: req.user.id,
        shopifyDiscountCode: code,
        shopifyDiscountId,
        coinAmount: Number(coinAmount),
        discountPaise,
        status: "PENDING",
        cartId: cartId || null,
        expiresAt,
      },
    });

    return res.json({
      success: true,
      redemptionId: redemption.id,
      shopifyDiscountCode: code,
      coinAmount: redemption.coinAmount,
      discountPaise: redemption.discountPaise,
      rupeeValue: redemption.discountPaise / 100,
      expiresAt: redemption.expiresAt,
    });
  } catch (error) {
    console.error("Generate redemption code error:", error);

    return res.status(500).json({
      error: error.message || "Redemption code generation failed",
    });
  }
});

// POST /redeem/confirm
router.post("/confirm", async (req, res) => {
  try {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const secret = process.env.SHOPIFY_API_SECRET;

    if (!secret || !req.rawBody || !hmac) {
      return res.status(401).json({
        error: "Missing Shopify webhook signature",
      });
    }

    const digest = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("base64");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmac)
    );

    if (!isValid) {
      return res.status(401).json({
        error: "Invalid Shopify webhook signature",
      });
    }

    const order = req.body;

    const shopifyOrderId = String(order.id || order.shopify_order_id || "");

    const discountCode =
      order.discount_code ||
      order.discountCode ||
      order.discount_codes?.[0]?.code;

    if (!discountCode) {
      return res.json({
        success: true,
        message: "No Cre8v discount code found",
      });
    }

    const redemption = await prisma.redemption.findUnique({
      where: {
        shopifyDiscountCode: discountCode,
      },
    });

    if (!redemption) {
      return res.json({
        success: true,
        message: "Discount code not related to Cre8v Coins",
      });
    }

    if (redemption.status === "APPLIED") {
      return res.json({
        success: true,
        message: "Redemption already confirmed",
      });
    }

    if (redemption.status !== "PENDING") {
      return res.status(400).json({
        error: "Redemption is not pending",
      });
    }

    if (new Date(redemption.expiresAt) < new Date()) {
      await prisma.redemption.update({
        where: {
          id: redemption.id,
        },
        data: {
          status: "EXPIRED",
        },
      });

      return res.status(400).json({
        error: "Redemption expired",
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: redemption.userId,
      },
    });

    if (!wallet || Number(wallet.balance || 0) < redemption.coinAmount) {
      return res.status(400).json({
        error: "Insufficient wallet balance during confirmation",
      });
    }

    const newBalance = Number(wallet.balance || 0) - redemption.coinAmount;

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: {
          userId: redemption.userId,
        },
        data: {
          balance: newBalance,
          lifetimeSpent: Number(wallet.lifetimeSpent || 0) + redemption.coinAmount,
          lastActivityAt: new Date(),
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "SPEND",
          amount: redemption.coinAmount,
          source: "SHOPIFY_REDEMPTION",
          sourcePlatform: "SHOPIFY",
          referenceId: shopifyOrderId,
          description: `Redeemed ${redemption.coinAmount} coins on Shopify`,
          balanceAfter: newBalance,
          metadata: {
            shopifyOrderId,
            discountCode,
            redemptionId: redemption.id,
            discountPaise: redemption.discountPaise,
          },
          idempotencyKey: `shopify-redemption-${shopifyOrderId}-${discountCode}`,
        },
      });

      await tx.redemption.update({
        where: {
          id: redemption.id,
        },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
          shopifyOrderId,
          transactionId: transaction.id,
        },
      });

      return transaction;
    });

    io.to(redemption.userId).emit("walletUpdated", {
      balance: newBalance,
    });

    return res.json({
      success: true,
      coinsDeducted: redemption.coinAmount,
      newBalance,
      transactionId: result.id,
    });
  } catch (error) {
    console.error("Redeem confirm error:", error);

    return res.status(500).json({
      error: "Redemption confirmation failed",
    });
  }
});

export default router;