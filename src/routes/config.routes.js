// import express from "express";
// import { prisma } from "../utils/prisma.js";

// const router = express.Router();

// router.get("/", async (req, res) => {
//   try {
//     const configs = await prisma.systemConfig.findMany();

//     const formatted = {};

//     // configs.forEach(item => {
//     //   formatted[item.key] = item.value;
//     // });

//     res.json({
//   DAILY_CAP: config.dailyGamingCap,      // ✅ actual field naam
//   DAILY_LOGIN_REWARD: config.starterCoinsAmount,
//   SESSION_REWARD: 10,
// });

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

// export default router;

import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    let config = await prisma.systemConfig.findFirst();

    if (!config) {
      config = await prisma.systemConfig.create({ data: {} });
    }

    res.json({
      DAILY_CAP: config.dailyGamingCap,
      DAILY_LOGIN_REWARD: config.starterCoinsAmount,
      SESSION_REWARD: 10,
      coinValuePaise: config.coinValuePaise,
      redemptionCapPercent: config.redemptionCapPercent,
      brandEventActive: config.brandEventActive,
      brandEventMultiplier: config.brandEventMultiplier,
    });

  } catch (error) {
    console.error("CONFIG GET ERROR:", error);
    res.status(500).json({ error: "Failed to fetch configs", details: error.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body;
    let config = await prisma.systemConfig.findFirst();

    const updateData = {};
    if (body.DAILY_CAP !== undefined) updateData.dailyGamingCap = Number(body.DAILY_CAP);
    if (body.coinValuePaise !== undefined) updateData.coinValuePaise = Number(body.coinValuePaise);
    if (body.brandEventActive !== undefined) updateData.brandEventActive = Boolean(body.brandEventActive);
    if (body.brandEventMultiplier !== undefined) updateData.brandEventMultiplier = Number(body.brandEventMultiplier);

    if (!config) {
      config = await prisma.systemConfig.create({ data: updateData });
    } else {
      config = await prisma.systemConfig.update({ where: { id: config.id }, data: updateData });
    }

    res.json(config);
  } catch (error) {
    console.error("CONFIG UPDATE ERROR:", error);
    res.status(500).json({ error: "Failed to update config", details: error.message });
  }
});

export default router;
