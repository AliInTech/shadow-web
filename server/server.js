/**
 * SHADOW WEB MESH ENGINE - PRODUCTION READY
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

const app = express();
const PORT = process.env.PORT || 5000;

// ===============================
// SECURITY MIDDLEWARE
// ===============================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:', process.env.CLIENT_URL || '*'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:']
      }
    }
  })
);

// ===============================
// CORS (PRODUCTION READY)
// ===============================
// Ab sirf process.env.CLIENT_URL allow hoga
const allowedOrigins = process.env.CLIENT_URL ? [process.env.CLIENT_URL] : [];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  })
);

app.use(express.json());

// ===============================
// MONGODB CONNECTION
// ===============================
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shadow_mesh')
  .then(() => console.log('💾 MongoDB Connected Successfully'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ===============================
// MESSAGE SCHEMA
// ===============================
const messageSchema = new mongoose.Schema({
  room: { type: String, required: true, index: true },
  cryptoPayload: {
    cipherText: { type: String, required: true },
    iv: { type: String, required: true }
  },
  isAudio: { type: Boolean, default: false },
  sender: { type: String, required: true },
  timestamp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// ===============================
// ROUTES
// ===============================
app.get('/', (req, res) => {
  res.status(200).send('Shadow Web Mesh Engine is Online.');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// ===============================
// SERVER + SOCKET
// ===============================
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// ===============================
// SOCKET LOGIC
// ===============================
io.on('connection', (socket) => {
  console.log(`📡 Connected: ${socket.id}`);

  socket.on('join-room', async (roomId) => {
    socket.join(roomId);
    const history = await Message.find({ room: roomId }).sort({ createdAt: 1 }).limit(50);
    socket.emit('chat-history', history);
  });

  socket.on('send-message', async (data) => {
    const msg = await Message.create(data);
    io.to(data.room).emit('receive-message', msg);
  });

  socket.on('webrtc-offer', (data) => socket.to(data.room).emit('webrtc-offer', data));
  socket.on('webrtc-answer', (data) => io.to(data.target).emit('webrtc-answer', data));
  socket.on('webrtc-ice-candidate', (data) => {
    data.target ? io.to(data.target).emit('webrtc-ice-candidate', data) : socket.to(data.room).emit('webrtc-ice-candidate', data);
  });

  socket.on('disconnect', () => console.log(`❌ Disconnected: ${socket.id}`));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SHADOW WEB SERVER RUNNING ON PORT:', PORT);
});


