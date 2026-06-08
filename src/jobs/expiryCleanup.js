import cron from "node-cron";
import { prisma } from "../utils/prisma.js";
import { deactivateShopifyDiscountCode } from "../services/shopifyService.js";

export function startExpiryCleanupJob() {
  // Har 10 minute mein chalega
  cron.schedule("*/10 * * * *", async () => {
    console.log("[ExpiryCleanup] Running expired redemptions cleanup...");

    try {
      const expiredRedemptions = await prisma.redemption.findMany({
        where: {
          status: "PENDING",
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (expiredRedemptions.length === 0) {
        console.log("[ExpiryCleanup] No expired redemptions found.");
        return;
      }

      console.log(
        `[ExpiryCleanup] Found ${expiredRedemptions.length} expired redemption(s). Processing...`
      );

      for (const redemption of expiredRedemptions) {
        try {
          // 1. Shopify discount code deactivate karo (optional but recommended)
          if (redemption.shopifyDiscountId) {
            try {
              await deactivateShopifyDiscountCode(redemption.shopifyDiscountId);
              console.log(
                `[ExpiryCleanup] Shopify code deactivated: ${redemption.shopifyDiscountCode}`
              );
            } catch (shopifyErr) {
              // Shopify fail ho toh bhi coins release karo — don't block
              console.warn(
                `[ExpiryCleanup] Shopify deactivation failed for ${redemption.shopifyDiscountCode}:`,
                shopifyErr.message
              );
            }
          }

          // 2. Ek transaction mein: redemption EXPIRED mark karo + lockedCoins release karo
          await prisma.$transaction([
            prisma.redemption.update({
              where: { id: redemption.id },
              data: { status: "EXPIRED" },
            }),
            prisma.wallet.update({
              where: { userId: redemption.userId },
              data: {
                lockedCoins: {
                  decrement: Math.max(Number(redemption.coinAmount || 0), 0),
                },
              },
            }),
          ]);

          console.log(
            `[ExpiryCleanup] Released ${redemption.coinAmount} locked coins for user ${redemption.userId} | Code: ${redemption.shopifyDiscountCode}`
          );
        } catch (err) {
          // Ek redemption fail ho toh baaki process karte raho
          console.error(
            `[ExpiryCleanup] Failed to process redemption ${redemption.id}:`,
            err.message
          );
        }
      }

      console.log("[ExpiryCleanup] Cleanup complete.");
    } catch (err) {
      console.error("[ExpiryCleanup] Job failed:", err.message);
    }
  });

  console.log("[ExpiryCleanup] Expiry cleanup job scheduled (every 10 min).");
}