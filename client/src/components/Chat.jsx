import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';

// Global Socket Instance
const socket = io('https://shadow-web-server-chat.onrender.com', {
  transports: ['websocket'],
  secure: true
});

function Chat() {
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  
  const { p2pStatus } = useWebRTC(socket, activeRoom);

  useEffect(() => {
    socket.on('receive-message', (data) => setChatLog((prev) => [...prev, data]));
    return () => socket.off('receive-message');
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId) {
      socket.emit('join-room', roomId);
      setActiveRoom(roomId);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim()) {
      const msgData = { room: activeRoom, text: message, sender: "You" };
      socket.emit('send-message', msgData);
      setChatLog((prev) => [...prev, msgData]);
      setMessage(''); // Ab ye kaam karega
    }
  };

  return (
    <div className="chat-container">
      {!activeRoom ? (
        <form onSubmit={handleJoin}>
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter Room ID" />
          <button type="submit">Establish Link</button>
        </form>
      ) : (
        <div className="chat-ui">
          <p>Status: {p2pStatus}</p>
          <div className="messages">
            {chatLog.map((m, i) => <p key={i}>{m.text}</p>)}
          </div>
          <form onSubmit={handleSend}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type here..." />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chat;

