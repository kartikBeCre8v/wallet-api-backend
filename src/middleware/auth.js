import { supabase } from "../utils/supabase.js";
import { prisma } from "../utils/prisma.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Invalid token",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    let dbUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
    });

    if (!dbUser) {
      dbUser = await prisma.user.create({
  data: {
    id: user.id,
    email: user.email,
    childName: "New Player",
    childAge: 10,
    parentPhone: "9876543211",
  },
});

      await prisma.wallet.create({
        data: {
          userId: user.id,
          balance: 0,
        },
      });

      console.log("New user & wallet created");
    }

    next();
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export default authMiddleware;