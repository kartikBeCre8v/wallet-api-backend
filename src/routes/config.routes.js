// import express from "express";
// import { prisma } from "../utils/prisma.js";

// const router = express.Router();

// router.get("/", async (req, res) => {
//   try {
//     const configs = await prisma.systemConfig.findMany();

//     const formatted = {};

//     configs.forEach(item => {
//       formatted[item.key] = item.value;
//     });

//     res.json(formatted);

//   } catch (error) {
//     res.status(500).json({
//       error: "Failed to fetch configs"
//     });
//   }
// });

// router.put("/", async (req, res) => {

//   try {

//     const { key, value } = req.body;

//     console.log("Updating config:", key, value);

//     const updatedConfig =
//       await prisma.systemConfig.upsert({

//         where: {
//           key: key
//         },

//         update: {
//           value: String(value)
//         },

//         create: {
//           key: key,
//           value: String(value)
//         }

//       });

//     res.json(updatedConfig);

//   } catch (error) {

//     console.error("CONFIG UPDATE ERROR:", error);

//     res.status(500).json({
//       error: "Failed to update config",
//       details: error.message
//     });

//   }

// });
// // GET redemption config
// router.get("/redemption", async (req, res) => {
//   try {
//     let config = await prisma.systemConfig.findFirst();

//     if (!config) {
//       config = await prisma.systemConfig.create({
//         data: {
//           coinValuePaise: 10,
//           redemptionCapPercent: 20,
//           inactivityExpiryDays: 365,
//           starterCoinsAmount: 200,
//           dailyGamingCap: 200,
//           brandEventActive: false,
//           brandEventMultiplier: 1.0
//         }
//       });
//     }

//     res.json({
//       redemptionCapPercent: config.redemptionCapPercent ?? 20,
//       coinValuePaise: config.coinValuePaise ?? 10
//     });

//   } catch (error) {
//     console.error("Load redemption config error:", error);
//     res.status(500).json({
//       error: "Failed to load redemption config"
//     });
//   }
// });

// // UPDATE redemption config
// router.put("/redemption", async (req, res) => {
//   try {
//     const { redemptionCapPercent } = req.body;

//     if (
//       redemptionCapPercent === undefined ||
//       Number(redemptionCapPercent) < 0 ||
//       Number(redemptionCapPercent) > 50
//     ) {
//       return res.status(400).json({
//         error: "redemptionCapPercent must be between 0 and 50"
//       });
//     }

//     let config = await prisma.systemConfig.findFirst();

//     if (!config) {
//       config = await prisma.systemConfig.create({
//         data: {
//           coinValuePaise: 10,
//           redemptionCapPercent: Number(redemptionCapPercent),
//           inactivityExpiryDays: 365,
//           starterCoinsAmount: 200,
//           dailyGamingCap: 200,
//           brandEventActive: false,
//           brandEventMultiplier: 1.0
//         }
//       });
//     } else {
//       config = await prisma.systemConfig.update({
//         where: {
//           id: config.id
//         },
//         data: {
//           redemptionCapPercent: Number(redemptionCapPercent)
//         }
//       });
//     }

//     res.json({
//       success: true,
//       redemptionCapPercent: config.redemptionCapPercent
//     });

//   } catch (error) {
//     console.error("Save redemption config error:", error);
//     res.status(500).json({
//       error: "Failed to save redemption config"
//     });
//   }
// });
// export default router;


import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();

async function getOrCreateSystemConfig() {
  let config = await prisma.systemConfig.findFirst();

  if (!config) {
    config = await prisma.systemConfig.create({
      data: {
        coinValuePaise: 10,
        redemptionCapPercent: 20,
        inactivityExpiryDays: 365,
        starterCoinsAmount: 200,
        dailyGamingCap: 200,
        brandEventActive: false,
        brandEventMultiplier: 1.0,
      },
    });
  }

  return config;
}

router.get("/", async (req, res) => {
  try {
    const config = await getOrCreateSystemConfig();

    res.json({
      coinValuePaise: config.coinValuePaise ?? 10,
      redemptionCapPercent: config.redemptionCapPercent ?? 20,
      inactivityExpiryDays: config.inactivityExpiryDays ?? 365,
      starterCoinsAmount: config.starterCoinsAmount ?? 200,
      dailyGamingCap: config.dailyGamingCap ?? 200,
      brandEventActive: config.brandEventActive ?? false,
      brandEventMultiplier: config.brandEventMultiplier ?? 1.0,
      brandEventLabel: config.brandEventLabel ?? null,
      brandEventUntil: config.brandEventUntil ?? null,
    });

  } catch (error) {
    console.error("CONFIG FETCH ERROR:", error);
    res.status(500).json({
      error: "Failed to fetch configs",
      details: error.message,
    });
  }
});

router.put("/", async (req, res) => {
  try {
    const config = await getOrCreateSystemConfig();

    const updatedConfig = await prisma.systemConfig.update({
      where: {
        id: config.id,
      },
      data: req.body,
    });

    res.json(updatedConfig);

  } catch (error) {
    console.error("CONFIG UPDATE ERROR:", error);
    res.status(500).json({
      error: "Failed to update config",
      details: error.message,
    });
  }
});

router.get("/redemption", async (req, res) => {
  try {
    const config = await getOrCreateSystemConfig();

    res.json({
      redemptionCapPercent: config.redemptionCapPercent ?? 20,
      coinValuePaise: config.coinValuePaise ?? 10,
    });

  } catch (error) {
    console.error("Load redemption config error:", error);
    res.status(500).json({
      error: "Failed to load redemption config",
      details: error.message,
    });
  }
});

router.put("/redemption", async (req, res) => {
  try {
    const { redemptionCapPercent } = req.body;

    if (
      redemptionCapPercent === undefined ||
      Number(redemptionCapPercent) < 0 ||
      Number(redemptionCapPercent) > 50
    ) {
      return res.status(400).json({
        error: "redemptionCapPercent must be between 0 and 50",
      });
    }

    const config = await getOrCreateSystemConfig();

    const updatedConfig = await prisma.systemConfig.update({
      where: {
        id: config.id,
      },
      data: {
        redemptionCapPercent: Number(redemptionCapPercent),
      },
    });

    res.json({
      success: true,
      redemptionCapPercent: updatedConfig.redemptionCapPercent,
    });

  } catch (error) {
    console.error("Save redemption config error:", error);
    res.status(500).json({
      error: "Failed to save redemption config",
      details: error.message,
    });
  }
});

export default router;