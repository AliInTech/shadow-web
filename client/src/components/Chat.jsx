import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import { encryptPayload, decryptPayload } from '../utils/crypto';

// 1. Connection Initialization (URL handling)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://shadow-web-server-chat.onrender.com';

const socket = io(SOCKET_URL, {
  transports: ['websocket'], // Render ke liye zaroori hai
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  secure: true
});

function Chat() {
  const [roomId, setRoomId] = useState('');
  const [activeRoom, setActiveRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const { p2pStatus, isMuted, isPeerMuted, toggleMute, localVolume, latency, isReconnecting } = useWebRTC(socket, activeRoom);
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [isRecordingMemo, setIsRecordingMemo] = useState(false);
  
  const chatWindowRef = useRef(null);
  const socketId5 = socket.id ? socket.id.substring(0, 5) : '...';

  // 2. Connection Lifecycle Management
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // 3. Socket Events
  useEffect(() => {
    socket.on('chat-history', async (history) => {
      const decryptedHistory = await Promise.all(
        history.map(async (log) => {
          if (log.cryptoPayload) {
            const clearText = await decryptPayload(log.cryptoPayload.cipherText, log.cryptoPayload.iv, activeRoom);
            return { ...log, text: log.isAudio ? "" : clearText, audioData: log.isAudio ? clearText : null };
          }
          return log;
        })
      );
      setChatLog(decryptedHistory);
    });

    socket.on('receive-message', async (data) => {
      if (data.cryptoPayload) {
        const clearText = await decryptPayload(data.cryptoPayload.cipherText, data.cryptoPayload.iv, activeRoom);
        setChatLog((prev) => [...prev, { ...data, text: data.isAudio ? "" : clearText, audioData: data.isAudio ? clearText : null }]);
      } else {
        setChatLog((prev) => [...prev, data]);
      }
    });

    return () => {
      socket.off('chat-history');
      socket.off('receive-message');
    };
  }, [activeRoom]);

  // 4. Send Message Function
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim() === '' || !isConnected) return;

    const encryptedCryptoPacket = await encryptPayload(message.trim(), activeRoom);
    socket.emit('send-message', {
      room: activeRoom,
      cryptoPayload: encryptedCryptoPacket,
      sender: socketId5,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    setMessage('');
  };

  return (
    <div className="chat-box">
      <div className="status-bar">
        Status: {isConnected ? <span className="connected">Connected</span> : <span className="disconnected">Disconnected</span>}
      </div>
      
      {!activeRoom ? (
        <form onSubmit={(e) => { e.preventDefault(); socket.emit('join-room', roomId); setActiveRoom(roomId); }}>
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter Room Code" />
          <button type="submit">Establish Link</button>
        </form>
      ) : (
        <div className="chat-window" ref={chatWindowRef}>
          {chatLog.map((msg, i) => <p key={i}>{msg.text}</p>)}
          <form onSubmit={handleSendMessage}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Send encrypted message..." />
            <button type="submit" disabled={!isConnected}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chat;