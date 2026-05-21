import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// WebSocket connection with stability options
const socket = io('https://shadow-web-server-chat.onrender.com', {
  transports: ['websocket'],
  secure: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

function Chat() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleMessage = (data) => setChatLog((prev) => [...prev, data]);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('receive-message', handleMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('receive-message', handleMessage);
    };
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      socket.emit('join-room', roomId);
      setActiveRoom(roomId);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      const msgData = { 
        room: activeRoom, 
        text: message, 
        sender: "You",
        timestamp: new Date().toLocaleTimeString()
      };
      socket.emit('send-message', msgData);
      setChatLog((prev) => [...prev, msgData]);
      setMessage('');
    }
  };

  return (
    <div className="chat-container">
      <div className="status-bar">
        Status: {isConnected ? <span style={{color: 'green'}}>Connected</span> : <span style={{color: 'red'}}>Disconnected</span>}
      </div>

      {!activeRoom ? (
        <div className="lobby">
          <h2>Shadow Web Lobby</h2>
          <form onSubmit={handleJoinRoom}>
            <input 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              placeholder="Enter Room Code" 
            />
            <button type="submit">Establish Link</button>
          </form>
        </div>
      ) : (
        <div className="chat-window">
          <h3>Channel: {activeRoom}</h3>
          <div className="message-list">
            {chatLog.map((msg, i) => (
              <div key={i} className="message">
                <strong>{msg.sender}:</strong> {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          
          <form onSubmit={handleSendMessage}>
            <input 
              value={message} 
              onChange={(e) => setMessage.target.value} 
              placeholder="Type message..." 
            />
            <button type="submit">Send</button>
          </form>
          <button onClick={() => setActiveRoom(null)}>Leave Room</button>
        </div>
      )}
    </div>
  );
}

export default Chat;

