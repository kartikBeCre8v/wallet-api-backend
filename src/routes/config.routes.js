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

// export default router;


import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();

// GET current config
router.get("/", async (req, res) => {
  try {
    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({ data: {} });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch system config" });
  }
});

// PUT update config
router.put("/", async (req, res) => {
  try {
    const { coinValuePaise, redemptionCapPercent } = req.body;
    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({ data: {} });
    }
    const updated = await prisma.systemConfig.update({
      where: { id: config.id },
      data: {
        ...(coinValuePaise !== undefined && { coinValuePaise: Number(coinValuePaise) }),
        ...(redemptionCapPercent !== undefined && { redemptionCapPercent: Number(redemptionCapPercent) }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update config" });
  }
});

export default router;