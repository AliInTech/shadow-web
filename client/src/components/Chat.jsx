import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://shadow-web-server-chat.onrender.com', {
  transports: ['websocket'],
  secure: true
});

function Chat() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('receive-message', (data) => setMessages((prev) => [...prev, data]));
    return () => { socket.off('connect'); socket.off('receive-message'); };
  }, []);

  return (
    <div>
      <h3>Status: {isConnected ? "Connected" : "Disconnected"}</h3>
      {/* Baaki UI logic */}
    </div>
  );
}
export default Chat;