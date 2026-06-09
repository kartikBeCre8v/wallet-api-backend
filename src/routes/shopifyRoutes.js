import express from "express";
import { prisma } from "../utils/prisma.js";
import { createShopifyDiscountCode } from "../services/shopifyService.js";
import crypto from "crypto";
import { deactivateShopifyDiscountCode } from "../services/shopifyService.js";


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
    const { email, cartTotalPaise, cartItems = [] } = req.body;

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
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
  return res.status(400).json({
    error: "Cart items are required",
  });
}

const selectedItem = cartItems
  .filter(item => item.variantId && Number(item.finalLinePrice) > 0)
  .sort((a, b) => Number(b.finalLinePrice) - Number(a.finalLinePrice))[0];

if (!selectedItem) {
  return res.status(400).json({
    error: "No eligible product found for redemption",
  });
}

    const maxDiscountPaise = Math.floor(
  (Number(selectedItem.finalLinePrice) * redemptionCapPercent) / 100
);

    const maxRedeemableCoins = Math.floor(
      maxDiscountPaise / coinValuePaise
    );

    const availableCoins =
  Number(user.wallet.balance || 0) -
  Number(user.wallet.lockedCoins || 0);

const recommendedRedeem = Math.min(
  availableCoins,
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
    const { email, coinAmount, cartTotalPaise, cartId, cartItems = [] } = req.body;

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

const availableCoins =
  Number(user.wallet.balance || 0) -
  Number(user.wallet.lockedCoins || 0);

if (Number(coinAmount) > availableCoins) {
      return res.status(400).json({
        error: "Not enough coins",
      });
    }

    // generate-code route mein, availableCoins check ke baad yeh add karo:

const existingPending = await prisma.redemption.findFirst({
  where: {
    userId: user.id,
    status: "PENDING",
  },
});

if (existingPending) {
  const minutesLeft = Math.ceil(
    (new Date(existingPending.expiresAt) - new Date()) / 60000
  );
  return res.status(400).json({
    error: "ACTIVE_REDEMPTION_EXISTS",
    message: `You already have an active code: ${existingPending.shopifyDiscountCode}. It expires in ${minutesLeft} minute(s). Cancel it first to generate a new one.`,
    redemptionId: existingPending.id,
    shopifyDiscountCode: existingPending.shopifyDiscountCode,
    expiresAt: existingPending.expiresAt,
  });
}

    const config = await prisma.systemConfig.findFirst();

    const coinValuePaise = Number(config?.coinValuePaise || 10);
    const redemptionCapPercent = Number(config?.redemptionCapPercent || 20);

    // const maxDiscountPaise = Math.floor(
    //   (Number(cartTotalPaise) * redemptionCapPercent) / 100
    // );

    // const maxCoinsByCart = Math.floor(maxDiscountPaise / coinValuePaise);

    // if (Number(coinAmount) > maxCoinsByCart) {
    //   return res.status(400).json({
    //     error: "Coin amount exceeds redemption limit",
    //   });
    // }


    if (!Array.isArray(cartItems) || cartItems.length === 0) {
  return res.status(400).json({
    error: "Cart items are required",
  });
}

const selectedItem = cartItems
  .filter(item => item.variantId && item.finalLinePrice > 0)
  .sort((a, b) => Number(b.finalLinePrice) - Number(a.finalLinePrice))[0];

if (!selectedItem) {
  return res.status(400).json({
    error: "No eligible product found for redemption",
  });
}

const maxDiscountPaise = Math.floor(
  (Number(selectedItem.finalLinePrice) * redemptionCapPercent) / 100
);

const maxCoinsBySelectedProduct = Math.floor(
  maxDiscountPaise / coinValuePaise
);

if (Number(coinAmount) > maxCoinsBySelectedProduct) {
  return res.status(400).json({
    error: "Coin amount exceeds selected product redemption limit",
  });
}
// const oldPendingRedemptions = await prisma.redemption.findMany({
//   where: {
//     userId: user.id,
//     status: "PENDING",
//   },
// });

// const coinsToRelease = oldPendingRedemptions.reduce(
//   (sum, redemption) => sum + Number(redemption.coinAmount || 0),
//   0
// );

// await prisma.$transaction([
//   prisma.redemption.updateMany({
//     where: {
//       userId: user.id,
//       status: "PENDING",
//     },
//     data: {
//       status: "CANCELLED",
//     },
//   }),

//   ...(coinsToRelease > 0
//     ? [
//         prisma.wallet.update({
//           where: {
//             userId: user.id,
//           },
//           data: {
//             lockedCoins: {
//   decrement: Math.min(
//     coinsToRelease,
//     Number(user.wallet.lockedCoins || 0)
//   ),
// },
//           },
//         }),
//       ]
//     : []),
// ]);
    // user ka naam se short string banao
const userShort = user.email.split("@")[0].slice(0, 6).toUpperCase();
const random = crypto.randomBytes(3).toString("hex").toUpperCase();
const code = `CC-${userShort}-${random}`;

    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
    const discountPaise = Number(coinAmount) * coinValuePaise;

//     const shopifyDiscountId = await createShopifyDiscountCode({
//   code,
//   discountPaise,
//   expiresAt,
//   eligibleVariantIds: [selectedItem.variantId],
// });

// //     const redemption = await prisma.redemption.create({
// //   data: {
// //     userId: user.id,
// //     shopifyDiscountCode: code,
// //     shopifyDiscountId,

// //     coinAmount: Number(coinAmount),
// //     discountPaise,

// //     status: "PENDING",

// //     cartId: cartId || null,

// //     expiresAt,

// //     eligibleProductIds: [
// //       String(selectedItem.productId)
// //     ],

// //     eligibleVariantIds: [
// //       String(selectedItem.variantId)
// //     ],

// //     originalCartValuePaise:
// //       Number(cartTotalPaise),
// //   },
// // });
// const [redemption] = await prisma.$transaction([
//   prisma.redemption.create({
//     data: {
//       userId: user.id,
//       shopifyDiscountCode: code,
//       shopifyDiscountId,

//       coinAmount: Number(coinAmount),
//       discountPaise,

//       status: "PENDING",
//       cartId: cartId || null,
//       expiresAt,

//       eligibleProductIds: [String(selectedItem.productId)],
//       eligibleVariantIds: [String(selectedItem.variantId)],
//       originalCartValuePaise: Number(cartTotalPaise),
//     },
//   }),

//   prisma.wallet.update({
//     where: {
//       userId: user.id,
//     },
//     data: {
//       lockedCoins: {
//         increment: Number(coinAmount),
//       },
//     },
//   }),
// ]);
// Pehle Shopify call karo — coins abhi mat lock karo
let shopifyDiscountId;
try {
  shopifyDiscountId = await createShopifyDiscountCode({
    code,
    discountPaise,
    expiresAt,
    eligibleVariantIds: [selectedItem.variantId],
  });
} catch (shopifyErr) {
  console.error("Shopify discount creation failed:", shopifyErr.message);
  return res.status(500).json({
    error: "Failed to create Shopify discount code",
    details: shopifyErr.message,
  });
}

// Shopify succeed hua — ab ek saath redemption banao + coins lock karo
const [redemption] = await prisma.$transaction([
  prisma.redemption.create({
    data: {
      userId: user.id,
      shopifyDiscountCode: code,
      shopifyDiscountId,
      coinAmount: Number(coinAmount),
      discountPaise,
      status: "PENDING",
      cartId: cartId || null,
      expiresAt,
      eligibleProductIds: [String(selectedItem.productId)],
      eligibleVariantIds: [String(selectedItem.variantId)],
      originalCartValuePaise: Number(cartTotalPaise),
    },
  }),
  prisma.wallet.update({
    where: { userId: user.id },
    data: {
      lockedCoins: { increment: Number(coinAmount) },
    },
  }),
]);
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
// POST /shopify/redeem/cancel
router.post("/redeem/cancel", async (req, res) => {
  try {
    const { email, redemptionId } = req.body;

    if (!email || !redemptionId) {
      return res.status(400).json({
        error: "email and redemptionId are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() },
      include: { wallet: true },
    });

    if (!user || !user.wallet) {
      return res.status(404).json({ error: "User not found" });
    }

    const redemption = await prisma.redemption.findUnique({
      where: { id: redemptionId },
    });

    if (!redemption) {
      return res.status(404).json({ error: "Redemption not found" });
    }

    if (redemption.userId !== user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (redemption.status !== "PENDING") {
      return res.status(400).json({
        error: `Cannot cancel — redemption is already ${redemption.status}`,
      });
    }

    // Shopify code deactivate karo — fail ho toh bhi coins release karo
    if (redemption.shopifyDiscountId) {
      try {
        await deactivateShopifyDiscountCode(redemption.shopifyDiscountId);
      } catch (shopifyErr) {
        console.warn(
          "Shopify deactivation failed during cancel:",
          shopifyErr.message
        );
      }
    }

    // DB: redemption CANCELLED + lockedCoins release — ek transaction mein
    await prisma.$transaction([
      prisma.redemption.update({
        where: { id: redemption.id },
        data: { status: "CANCELLED" },
      }),
      prisma.wallet.update({
        where: { userId: user.id },
        data: {
          lockedCoins: {
            decrement: Math.min(
              Number(redemption.coinAmount),
              Number(user.wallet.lockedCoins || 0)
            ),
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      message: "Redemption cancelled and coins released",
      coinsReleased: redemption.coinAmount,
    });
  } catch (error) {
    console.error("Cancel redemption error:", error);
    return res.status(500).json({
      error: "Failed to cancel redemption",
      details: error.message,
    });
  }
});

// POST /shopify/webhook/order-paid
router.post("/webhook/order-paid", async (req, res) => {
  try {
    // Step 1: HMAC verify karo
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

    if (secret && hmacHeader) {
      const rawBody = req.rawBody;
      if (!rawBody) {
        console.warn("[Webhook] rawBody missing — check index.js verify config");
        return res.status(401).json({ error: "Raw body missing" });
      }
      const digest = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("base64");

      if (digest !== hmacHeader) {
        console.warn("[Webhook] HMAC verification failed");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // Step 2: Order data parse karo
    const order = req.body;

    if (!order || !order.id) {
      return res.status(400).json({ error: "Invalid order payload" });
    }

    console.log(`[Webhook] Order received: ${order.id}`);

    // Step 3: CC- se shuru hone wala discount code dhundho
    const discountCodes = order.discount_codes || [];
    const cre8vCode = discountCodes.find((d) =>
      d.code?.startsWith("CC-")
    );

    if (!cre8vCode) {
      console.log("[Webhook] No Cre8v code in order — skipping");
      return res.status(200).json({ message: "No Cre8v code in this order" });
    }

    console.log(`[Webhook] Cre8v code found: ${cre8vCode.code}`);

    // Step 4: Redemption record dhundho
    const redemption = await prisma.redemption.findUnique({
      where: { shopifyDiscountCode: cre8vCode.code },
    });

    if (!redemption) {
      console.warn(`[Webhook] Redemption not found for code: ${cre8vCode.code}`);
      return res.status(200).json({ message: "Redemption not found" });
    }

    // Step 5: Already processed check
    if (redemption.status !== "PENDING") {
      console.log(`[Webhook] Already processed: ${redemption.status}`);
      return res.status(200).json({ message: `Already ${redemption.status}` });
    }

    // Step 6: Wallet fetch karo safe decrement ke liye
    const wallet = await prisma.wallet.findUnique({
      where: { userId: redemption.userId },
    });

    if (!wallet) {
      console.error(`[Webhook] Wallet not found for user: ${redemption.userId}`);
      return res.status(200).json({ message: "Wallet not found" });
    }

    const safeDeductBalance = Math.min(
      redemption.coinAmount,
      Number(wallet.balance || 0)
    );
    const safeDeductLocked = Math.min(
      redemption.coinAmount,
      Number(wallet.lockedCoins || 0)
    );

    // Step 7: Ek transaction mein sab update karo
const newBalance = Number(wallet.balance || 0) - safeDeductBalance;

await prisma.$transaction([
  prisma.redemption.update({
    where: { id: redemption.id },
    data: {
      status: "USED",
      shopifyOrderId: String(order.id),
      usedAt: new Date(),
    },
  }),
  prisma.wallet.update({
    where: { userId: redemption.userId },
    data: {
      balance: { decrement: safeDeductBalance },
      lockedCoins: { decrement: safeDeductLocked },
      lifetimeSpent: { increment: safeDeductBalance },
    },
  }),
  prisma.transaction.create({
    data: {
      walletId: wallet.id,
      type: "SPEND",
      amount: safeDeductBalance,
      source: `Shopify Order ${order.id}`,
      sourcePlatform: "SHOPIFY",
      referenceId: String(order.id),
      description: `Cre8v Coins redeemed — discount code ${redemption.shopifyDiscountCode}`,
      balanceAfter: newBalance,
      idempotencyKey: `webhook-order-${order.id}`,
    },
  }),
]);

    console.log(
      `[Webhook] Order ${order.id} processed — ${redemption.coinAmount} coins deducted for user ${redemption.userId}`
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[Webhook] order-paid error:", err.message);
    // Shopify expects 200 even on error — warna retry karta rehta hai
    return res.status(200).json({ error: "Webhook processing failed" });
  }
});
export default router;