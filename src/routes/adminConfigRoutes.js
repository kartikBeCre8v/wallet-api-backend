// import express from "express";
// import { prisma } from "../utils/prisma.js";

// const router = express.Router();

// // GET all configs
// router.get("/", async (req, res) => {
//   const configs = await prisma.systemConfig.findMany();
//   res.json(configs);
// });

// // UPDATE config
// router.post("/update", async (req, res) => {
//   const { key, value } = req.body;

//   const updated = await prisma.systemConfig.update({
//     where: { key },
//     data: { value: String(value) },
//   });

//   res.json(updated);
// });

// export default router;