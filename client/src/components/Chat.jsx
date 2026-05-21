import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import { encryptPayload, decryptPayload } from '../utils/crypto';

// Sahi URL update ki gayi hai
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://shadow-web-server-chat.onrender.com';

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  secure: true
});

function Chat() {
  const [roomId, setRoomId] = useState('');
  const [activeRoom, setActiveRoom] = useState(null);
  
  const { 
    p2pStatus, 
    isMuted, 
    isPeerMuted, 
    toggleMute, 
    localVolume, 
    latency, 
    isReconnecting 
  } = useWebRTC(socket, activeRoom);
  
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [isRecordingMemo, setIsRecordingMemo] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatWindowRef = useRef(null);
  
  // Socket ID security string
  const socketId5 = socket.id ? socket.id.substring(0, 5) : '...';

  useEffect(() => {
    socket.on('chat-history', async (history) => {
      const decryptedHistory = await Promise.all(
        history.map(async (log) => {
          if (log.cryptoPayload) {
            const clearText = await decryptPayload(log.cryptoPayload.cipherText, log.cryptoPayload.iv, activeRoom);
            return {
              ...log,
              text: log.isAudio ? "" : clearText,
              audioData: log.isAudio ? clearText : null
            };
          }
          return log;
        })
      );
      setChatLog(decryptedHistory);
    });

    socket.on('receive-message', async (data) => {
      if (data.cryptoPayload) {
        const clearText = await decryptPayload(data.cryptoPayload.cipherText, data.cryptoPayload.iv, activeRoom);
        setChatLog((prevLog) => [
          ...prevLog,
          {
            ...data,
            text: data.isAudio ? "" : clearText,
            audioData: data.isAudio ? clearText : null
          }
        ]);
      } else {
        setChatLog((prevLog) => [...prevLog, data]);
      }
    });

    socket.on('system-message', (data) => {
      setChatLog((prevLog) => [...prevLog, { ...data, isSystem: true }]);
    });

    return () => {
      socket.off('chat-history');
      socket.off('receive-message');
      socket.off('system-message');
    };
  }, [activeRoom]);

  // Handle Join Room
  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim() === '') return;
    const sanitizedRoom = roomId.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    socket.emit('join-room', sanitizedRoom);
    setActiveRoom(sanitizedRoom);
    setChatLog([]);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim() === '') return;

    const encryptedCryptoPacket = await encryptPayload(message.trim(), activeRoom);
    const messageData = {
      room: activeRoom,
      cryptoPayload: encryptedCryptoPacket,
      isAudio: false,
      sender: socketId5,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send-message', messageData);
    setMessage('');
  };

  // UI rendering logic here (same as your provided code)...
  // ... (Baki ka UI code waisa hi rahega)
  return (
    <div className="chat-container">
      {/* Lobby ya Chat Window render karein */}
      {!activeRoom ? (
        <div className="lobby">
           <form onSubmit={handleJoinRoom}>
             <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter Room" />
             <button type="submit">Establish Link</button>
           </form>
        </div>
      ) : (
        <div className="active-chat">
          {/* Chat log aur controls */}
        </div>
      )}
    </div>
  );
}

export default Chat;

