import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const formatted = {};

    configs.forEach(item => {
      formatted[item.key] = item.value;
    });

    res.json(formatted);

  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch configs"
    });
  }
});

router.put("/", async (req, res) => {

  try {

    const { key, value } = req.body;

    console.log("Updating config:", key, value);

    const updatedConfig =
      await prisma.systemConfig.upsert({

        where: {
          key: key
        },

        update: {
          value: String(value)
        },

        create: {
          key: key,
          value: String(value)
        }

      });

    res.json(updatedConfig);

  } catch (error) {

    console.error("CONFIG UPDATE ERROR:", error);

    res.status(500).json({
      error: "Failed to update config",
      details: error.message
    });

  }

});

export default router;


