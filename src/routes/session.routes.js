import express from 'express';

import {
  startSession,
  endSession,
} from '../services/sessionService.js';

import authMiddleware 
from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/start',
  authMiddleware,

  async (req, res) => {

    try {

      const session =
        await startSession(
          req.user.id
        );

      res.json({
        success: true,
        session,
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);
router.post(
  '/end',
  authMiddleware,

  async (req, res) => {

    try {

      const { sessionId } =
        req.body;

      const session =
        await endSession(
          sessionId
        );

      res.json({
        success: true,
        session,
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

export default router;