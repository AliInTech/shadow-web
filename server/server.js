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
const PORT = process.env.PORT || 5000;

// =========================================
// SECURITY MIDDLEWARE & CSP DEFINITIONS
// =========================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http://192.168.1.13:*'],
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
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  })
);

app.use(express.json());

// =========================================
// MONGODB DATABASE CONNECTION
// =========================================
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shadow_mesh')
  .then(() => {
    console.log('💾 MongoDB Connected Successfully');
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err);
  });

// =========================================
// ENCRYPTED MESSAGE SCHEMA
// =========================================
const messageSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true,
    index: true
  },
  cryptoPayload: {
    cipherText: { type: String, required: true },
    iv: { type: String, required: true }
  },
  isAudio: {
    type: Boolean,
    default: false
  },
  sender: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model('Message', messageSchema);

// =========================================
// HEALTH INTERFACE (API GATEWAY)
// =========================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// =========================================
// CORE INFRASTRUCTURE SERVER OBJECTS
// =========================================
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// =========================================
// SOCKET CONFIGURATION PIPELINE
// =========================================
io.on('connection', (socket) => {
  console.log(`📡 Node linked to matrix: ${socket.id}`);

  // 1. JOIN CHANNEL ROUTE
  socket.on('join-room', async (roomId) => {
    try {
      const currentRooms = Array.from(socket.rooms);
      currentRooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      socket.join(roomId);
      console.log(`🔑 Node [${socket.id.substring(0, 5)}] routed to channel: ${roomId}`);

      // MongoDB se encrypted data chunks nikalna
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
        text: `🔄 Node [${socket.id.substring(0, 5)}] joined. Calibrating secure sync grids...`
      });
    } catch (err) {
      console.error('❌ Failed to join room:', err);
    }
  });

  // 2. ENCRYPTED MESSAGE ROUTING & DB WRITE
  socket.on('send-message', async (data) => {
    try {
      const { room, cryptoPayload, isAudio, sender, timestamp } = data;
      console.log(`📩 Encrypted payload received for room [${room}]`);

      const newMessage = new Message({
        room,
        cryptoPayload,
        isAudio,
        sender,
        timestamp
      });

      await newMessage.save();

      io.to(room).emit('receive-message', {
        cryptoPayload,
        isAudio,
        sender,
        timestamp
      });
    } catch (err) {
      console.error('❌ Archival write fault:', err);
    }
  });

  // 3. PURGE ROOM SEQUENCE EVENT (DB & MEMORY CRASH WIPE)
  socket.on('purge-room', async (roomId) => {
    try {
      // MongoDB storage clusters se data permanently delete karna
      const deletionResult = await Message.deleteMany({ room: roomId });
      console.log(`🧹 DB wiped clean for room: ${roomId}. Dropped rows: ${deletionResult.deletedCount}`);
      
      // UI clear signals dispatch karna
      io.to(roomId).emit('room-purged');
      
      // Network overlay alert drop karna
      io.to(roomId).emit('system-message', {
        text: `⚠️ CRITICAL NOTICE: Room logs have been REMOTELY PURGED via secure master key sequence.`
      });
    } catch (err) {
      console.error('❌ Database Purge Operation Failed:', err);
    }
  });

  // 4. WEBRTC SIGNALING RELAYS
  socket.on('webrtc-offer', (data) => {
    try {
      const { room, offer } = data;
      console.log(`📦 Relaying WebRTC Offer from [${socket.id.substring(0, 5)}]`);
      socket.to(room).emit('webrtc-offer', {
        offer,
        sender: socket.id
      });
    } catch (err) {
      console.error('❌ WebRTC Offer Relay Error:', err);
    }
  });

  socket.on('webrtc-answer', (data) => {
    try {
      const { target, answer } = data;
      console.log(`📦 Relaying WebRTC Answer to peer [${target.substring(0, 5)}]`);
      io.to(target).emit('webrtc-answer', {
        answer,
        sender: socket.id
      });
    } catch (err) {
      console.error('❌ WebRTC Answer Relay Error:', err);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    try {
      const { room, target, candidate } = data;
      if (target) {
        io.to(target).emit('webrtc-ice-candidate', {
          candidate,
          sender: socket.id
        });
        console.log(`🧊 Relaying ICE Candidate directly to peer [${target.substring(0, 5)}]`);
        return;
      }
      socket.to(room).emit('webrtc-ice-candidate', {
        candidate,
        sender: socket.id
      });
      console.log(`🧊 Broadcasting ICE Candidate across room [${room}]`);
    } catch (err) {
      console.error('❌ ICE Relay Error:', err);
    }
  });

  // 5. MEDIA OVERLAY AUDIO STATUS RELAY
  socket.on('mute-status-change', (data) => {
    try {
      const { room, isMuted } = data;
      socket.to(room).emit('peer-mute-status', isMuted);
    } catch (err) {
      console.error('❌ Mute Relay Error:', err);
    }
  });

  // 6. PEER DISCONNECT WATCHDOG
  socket.on('disconnect', () => {
    console.log(`🚨 Node dropped from network grid: ${socket.id}`);
    io.emit('system-message', {
      text: '🚨 A network peer dropped offline. Media pipelines closed down.'
    });
  });
});

// =========================================
// RUNTIME BOUND PROCESS INITIALIZATION
// =========================================
httpServer.listen(PORT, () => {
  console.log('=========================================');
  console.log(` 🌑 SHADOW WEB MESH ENGINE ONLINE ON PORT ${PORT}`);
  console.log('=========================================');
});

