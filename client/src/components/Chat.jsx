import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';
import { encryptPayload, decryptPayload } from '../utils/crypto';

const socket = io('http://localhost:5000');

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
  const socketId5 = socket.id ? socket.id.substring(0, 5) : '...';

  useEffect(() => {
    // 1. Intercept and decrypt the persistent DB archive log batch
    socket.on('chat-history', async (history) => {
      const decryptedHistory = await Promise.all(
        history.map(async (log) => {
          // If the message contains encrypted components, decrypt them inline
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

    // 2. Intercept and decrypt real-time messaging payloads
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

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatLog]);

  // --- SECURE VOICE NOTE RECORDING ENGINE ---
  const startVoiceRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          
          // Local browser encryption happens here before socket broadcast
          const encryptedCryptoPacket = await encryptPayload(base64Audio, activeRoom);

          const messageData = {
            room: activeRoom,
            cryptoPayload: encryptedCryptoPacket, // Server reads raw cipher text metadata only
            isAudio: true,
            sender: socketId5,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          
          socket.emit('send-message', messageData);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMemo(true);
    } catch (err) {
      console.error('❌ Failed to lock microphone permissions:', err);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingMemo) {
      mediaRecorderRef.current.stop();
      setIsRecordingMemo(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim() === '') return;
    const sanitizedRoom = roomId.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!sanitizedRoom) return;

    socket.emit('join-room', sanitizedRoom);
    setActiveRoom(sanitizedRoom);
    setChatLog([]);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim() === '') return;

    const plainText = message.trim().substring(0, 1000);
    
    // Encrypt text string locally
    const encryptedCryptoPacket = await encryptPayload(plainText, activeRoom);

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

  if (!activeRoom) {
    return (
      <div className="placeholder-card lobby-card">
        <h3>Bridge Configuration</h3>
        <p>Initialize or join a secure cryptographic network channel.</p>
        <form onSubmit={handleJoinRoom} className="lobby-form">
          <input
            type="text"
            placeholder="Enter Room Code (e.g., Alpha-9)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            maxLength="30"
          />
          <button type="submit">Establish Link</button>
        </form>
      </div>
    );
  }

  return (
    <div className="chat-box">
      {/* --- TELEMETRY HEADER --- */}
      <div className="room-header">
        <div className="header-meta">
          <span>Channel: <strong>{activeRoom}</strong></span>
          <div className="telemetry-badges-group">
            <span className="p2p-badge strict-encrypted-badge" title="AES-GCM Zero-Knowledge Channel Encryption Active">
              🔒 E2E SECURE
            </span>
            <span className={`p2p-badge ${p2pStatus ? p2pStatus.toLowerCase() : 'disconnected'} ${isReconnecting ? 'reconnecting' : ''}`}>
              {isReconnecting ? '🔄 Reconnecting' : `P2P: ${p2pStatus}`}
            </span>
            {latency !== null && (
              <span className={`telemetry-ping ${latency > 150 ? 'high-latency' : 'clean-latency'}`}>
                ⏱️ {latency} ms
              </span>
            )}
          </div>
        </div>

        <div className="voice-controls-panel">
          {p2pStatus?.toLowerCase() === 'connected' && !isReconnecting && (
            <span className={`peer-status-indicator ${isPeerMuted ? 'muted' : 'live'}`}>
              {isPeerMuted ? '🔇 Peer Muted' : '🔊 Peer Live'}
            </span>
          )}
          
          <div className="visualizer-container" title="Local Microphone Waveform Amplitude">
            <div className={`visualizer-bar ${isMuted ? 'muted' : 'active'}`} style={{ height: `${isMuted ? 4 : Math.max(4, (localVolume / 100) * 28)}px` }} />
            <div className={`visualizer-bar center-bar ${isMuted ? 'muted' : 'active'}`} style={{ height: `${isMuted ? 4 : Math.max(4, (localVolume / 100) * 38)}px` }} />
            <div className={`visualizer-bar ${isMuted ? 'muted' : 'active'}`} style={{ height: `${isMuted ? 4 : Math.max(4, (localVolume / 100) * 28)}px` }} />
          </div>

          <button onClick={toggleMute} className={`mic-toggle-btn ${isMuted ? 'mic-off' : 'mic-on'}`}>
            {isMuted ? '🎙️ Mic Muted' : '🎙️ Mic Active'}
          </button>
          
          <button onClick={() => setActiveRoom(null)} className="leave-btn">Disconnect</button>
        </div>
      </div>

      {/* --- TRANSCRIPTION WINDOW --- */}
      <div className="chat-window" ref={chatWindowRef}>
        {chatLog.length === 0 ? (
          <div className="empty-state-container">
            <div className="empty-state-shield">🔑</div>
            <h4>Secure Archive Initialized</h4>
            <p>End-to-End keys derived. No historical logs stored for channel <strong>{activeRoom}</strong>.</p>
          </div>
        ) : (
          chatLog.map((msg, index) => {
            if (msg.isSystem) {
              return <div key={index} className="system-alert"><p>{msg.text}</p></div>;
            }
            
            const isOwnMessage = msg.sender === socketId5;

            return (
              <div key={index} className={`chat-bubble ${isOwnMessage ? 'own' : 'peer'}`}>
                <span className="sender-tag">Node [{msg.sender}]:</span>
                
                {msg.audioData ? (
                  <div className="voice-note-player-context">
                    <audio src={msg.audioData} controls className="premium-audio-track" />
                  </div>
                ) : (
                  <p className="message-text">{msg.text}</p>
                )}
                
                <span className="time-tag">{msg.timestamp}</span>
              </div>
            );
          })
        )}
      </div>
      
      {/* --- INPUT CONTROLS --- */}
      <div className="chat-controls-wrapper">
        <form onSubmit={handleSendMessage} className="chat-controls">
          <input
            type="text"
            placeholder={isRecordingMemo ? "Encrypting hardware stream..." : `Send encrypted message to room...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isRecordingMemo}
            maxLength="1000"
          />
          <button type="submit" disabled={isRecordingMemo || !message.trim()}>Send</button>
        </form>

        <button
          type="button"
          onMouseDown={startVoiceRecording}
          onMouseUp={stopVoiceRecording}
          onTouchStart={startVoiceRecording}
          onTouchEnd={stopVoiceRecording}
          className={`voice-note-trigger-btn ${isRecordingMemo ? 'recording' : 'idle'}`}
        >
          {isRecordingMemo ? '🛑 Recording...' : '🎤 Hold to Talk'}
        </button>
      </div>
    </div>
  );
}

export default Chat;

