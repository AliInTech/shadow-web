/**
 * server/server.js
 * SHADOW WEB MESH ENGINE - HARDENED PRODUCTION KERNEL
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

const app = express();

// ✅ FIX 1: Production-safe PORT
const PORT = process.env.PORT || 5000;

// =========================================
// SECURITY MIDDLEWARE & CSP DEFINITIONS
// =========================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'http://192.168.1.13:*',
          process.env.CLIENT_URL || "*"
        ],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        mediaSrc: ["'self'", 'blob:']
      }
    }
  })
);

// =========================================
// CORS RESOURCE POOLING
// =========================================
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  })
);

app.use(express.json());

// =========================================
// MONGODB DATABASE CONNECTION
// =========================================
(async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shadow_mesh'
    );
    console.log('💾 MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
})();

// =========================================
// ENCRYPTED MESSAGE SCHEMA
// =========================================
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

// =========================================
// HEALTH INTERFACE
// =========================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// =========================================
// SERVER + SOCKET INIT
// =========================================
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// =========================================
// SOCKET CONFIGURATION PIPELINE
// =========================================
io.on('connection', (socket) => {
  console.log(`📡 Node linked: ${socket.id}`);

  // JOIN ROOM
  socket.on('join-room', async (roomId) => {
    try {
      Array.from(socket.rooms).forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });

      socket.join(roomId);

      const historicalLogs = await Message.find({ room: roomId })
        .sort({ createdAt: 1 })
        .limit(50);

      socket.emit(
        'chat-history',
        historicalLogs.map((log) => ({
          cryptoPayload: log.cryptoPayload,
          isAudio: log.isAudio,
          sender: log.sender,
          timestamp: log.timestamp
        }))
      );

      socket.to(roomId).emit('system-message', {
        text: `🔄 Node ${socket.id.slice(0, 5)} joined`
      });
    } catch (err) {
      console.error(err);
    }
  });

  // SEND MESSAGE
  socket.on('send-message', async (data) => {
    try {
      const msg = await Message.create(data);

      io.to(data.room).emit('receive-message', {
        cryptoPayload: msg.cryptoPayload,
        isAudio: msg.isAudio,
        sender: msg.sender,
        timestamp: msg.timestamp
      });
    } catch (err) {
      console.error(err);
    }
  });

  // PURGE ROOM
  socket.on('purge-room', async (roomId) => {
    try {
      await Message.deleteMany({ room: roomId });

      io.to(roomId).emit('room-purged');
      io.to(roomId).emit('system-message', {
        text: '⚠️ Room purged successfully'
      });
    } catch (err) {
      console.error(err);
    }
  });

  // WEBRTC
  socket.on('webrtc-offer', (data) => {
    socket.to(data.room).emit('webrtc-offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    io.to(data.target).emit('webrtc-answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    if (data.target) {
      io.to(data.target).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        sender: socket.id
      });
    } else {
      socket.to(data.room).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        sender: socket.id
      });
    }
  });

  socket.on('disconnect', () => {
    io.emit('system-message', {
      text: '⚠️ Peer disconnected'
    });
  });
});

// =========================================
// GRACEFUL SHUTDOWN (DEPLOY SAFE)
// =========================================
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    mongoose.connection.close(false, () => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

// =========================================
// START SERVER (IMPORTANT FIX: 0.0.0.0)
// =========================================
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('=========================================');
  console.log(` 🌑 SHADOW WEB MESH ENGINE ONLINE`);
  console.log(` 🚀 PORT: ${PORT}`);
  console.log('=========================================');
});

