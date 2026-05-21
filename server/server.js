import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shadow_mesh');

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket"] // WebSocket ko force kiya hai
});

io.on('connection', (socket) => {
  console.log(`📡 Connected: ${socket.id}`);
  
  socket.on('join-room', (roomId) => socket.join(roomId));
  socket.on('send-message', (data) => io.to(data.room).emit('receive-message', data));
  
  socket.on('disconnect', () => console.log(`❌ Disconnected: ${socket.id}`));
});

httpServer.listen(PORT, '0.0.0.0', () => console.log('🚀 Server Running on PORT:', PORT));