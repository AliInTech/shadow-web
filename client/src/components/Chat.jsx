import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// URL ko exact format mein rakhein (no slash at end)
const SOCKET_URL = 'https://shadow-web-server-chat.onrender.com';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

function Chat() {
  const [isConnected, setIsConnected] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to Server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Server');
      setIsConnected(false);
    });

    socket.on('receive-message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive-message');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      socket.emit('join-room', roomId);
      setActiveRoom(roomId);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim()) {
      const payload = { room: activeRoom, text: message, sender: "You" };
      socket.emit('send-message', payload);
      setMessages((prev) => [...prev, payload]);
      setMessage('');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Shadow Web Mesh</h2>
      <div style={{ color: isConnected ? 'green' : 'red', fontWeight: 'bold' }}>
        Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
      </div>

      {!activeRoom ? (
        <form onSubmit={handleJoin} style={{ marginTop: '20px' }}>
          <input 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)} 
            placeholder="Room ID" 
          />
          <button type="submit">Join Room</button>
        </form>
      ) : (
        <div style={{ marginTop: '20px' }}>
          <h4>Room: {activeRoom}</h4>
          <div style={{ height: '300px', border: '1px solid #ccc', overflowY: 'scroll', padding: '10px' }}>
            {messages.map((m, i) => (
              <p key={i}><strong>{m.sender}:</strong> {m.text}</p>
            ))}
          </div>
          <form onSubmit={handleSend} style={{ marginTop: '10px' }}>
            <input 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              placeholder="Type message..." 
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chat;