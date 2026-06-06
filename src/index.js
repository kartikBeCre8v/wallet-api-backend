import 'dotenv/config';
import express from 'express';
import cors from 'cors';
// import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import configRoutes from './routes/config.routes.js';
import earningRulesRoutes from './routes/earningRules.routes.js';
import walletRoutes from './routes/walletRoutes.js';
import sessionRoutes from './routes/session.routes.js';
import redemptionRoutes from './routes/redemptionRoutes.js';
import shopifyRoutes from './routes/shopifyRoutes.js';
// dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl === '/redeem/confirm') {
      req.rawBody = buf;
    }
  }
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use(
  '/session',
  sessionRoutes
);

app.use('/wallet', walletRoutes);
app.use('/redeem', redemptionRoutes);
app.use('/shopify', shopifyRoutes);
app.use('/config', configRoutes);
app.use('/earning-rules', earningRulesRoutes);
app.get('/', (req, res) => {
  res.send('Wallet API Running');
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

io.on('connection', (socket) => {

  console.log('User connected:', socket.id);
  socket.on("join-wallet", (userId) => {

  socket.join(userId);

  console.log(
    "Joined wallet room:",
    userId
  );

});

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});