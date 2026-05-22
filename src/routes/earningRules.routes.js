import express from "express";
import { prisma } from "../utils/prisma.js";

const router = express.Router();


// GET all earning rules
router.get("/", async (req, res) => {

  try {

    const rules =
      await prisma.earningRule.findMany();

    res.json(rules);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to fetch earning rules"
    });

  }

});


// UPDATE earning rules
router.put("/", async (req, res) => {

  try {

    const updates = req.body;

    for (const item of updates) {

      await prisma.earningRule.update({

        where: {
          ruleKey: item.ruleKey
        },

        data: {

          baseCoins:
            item.baseCoins,

          dailyCap:
            item.dailyCap,

          isActive:
            item.isActive

        }

      });

    }

    res.json({
      success: true
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to update earning rules"
    });

  }

});

export default router;