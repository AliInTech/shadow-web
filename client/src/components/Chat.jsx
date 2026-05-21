import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// WebSocket connection setup
const socket = io('https://shadow-web-server-chat.onrender.com', {
  transports: ['websocket'],
  secure: true
});

function Chat() {
  const [isConnected, setIsConnected] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
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
    if (message.trim() && isConnected) {
      const payload = { room: activeRoom, text: message, sender: "You" };
      socket.emit('send-message', payload);
      setMessages((prev) => [...prev, payload]);
      setMessage(''); // Reset input
    }
  };

  return (
    <div className="chat-container">
      <h3>Status: {isConnected ? "🟢 Online" : "🔴 Disconnected"}</h3>

      {!activeRoom ? (
        <form onSubmit={handleJoin}>
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
          <button type="submit">Join</button>
        </form>
      ) : (
        <div>
          <div className="chat-box" style={{height:'300px', border:'1px solid #ccc', overflowY:'scroll'}}>
            {messages.map((m, i) => <p key={i}><strong>{m.sender}:</strong> {m.text}</p>)}
          </div>
          <form onSubmit={handleSend}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message..." />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
export default Chat;

