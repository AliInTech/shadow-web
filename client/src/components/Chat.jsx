import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import { encryptPayload, decryptPayload } from '../utils/crypto';

const socket = io('https://shadow-web-server-chat.onrender.com', {
  transports: ['websocket'],
  secure: true
});

function Chat() {
  const [roomId, setRoomId] = useState('');
  const [activeRoom, setActiveRoom] = useState(null);
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  
  // Custom Hook for WebRTC
  const { p2pStatus, isMuted, isPeerMuted, toggleMute, localVolume, latency, isReconnecting } = useWebRTC(socket, activeRoom);
  
  const chatWindowRef = useRef(null);
  const socketId5 = socket.id ? socket.id.substring(0, 5) : '...';

  useEffect(() => {
    socket.on('receive-message', (data) => setChatLog((prev) => [...prev, data]));
    return () => socket.off('receive-message');
  }, []);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    socket.emit('join-room', roomId);
    setActiveRoom(roomId);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const msgData = { 
        room: activeRoom, 
        text: message, 
        sender: socketId5,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    };
    socket.emit('send-message', msgData);
    setChatLog((prev) => [...prev, msgData]);
    setMessage('');
  };

  if (!activeRoom) {
    return (
      <div className="placeholder-card lobby-card">
        <h3>Bridge Configuration</h3>
        <form onSubmit={handleJoinRoom} className="lobby-form">
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter Room Code" />
          <button type="submit">Establish Link</button>
        </form>
      </div>
    );
  }

  return (
    <div className="chat-box">
      <div className="room-header">
        <span>Channel: <strong>{activeRoom}</strong></span>
        <span className={`p2p-badge ${p2pStatus?.toLowerCase()}`}>{p2pStatus}</span>
        <button onClick={() => setActiveRoom(null)}>Disconnect</button>
      </div>

      <div className="chat-window" ref={chatWindowRef}>
        {chatLog.map((msg, i) => (
          <div key={i} className="chat-bubble">
            <small>[{msg.sender}]</small> <p>{msg.text}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSendMessage} className="chat-controls">
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Send message..." />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;

