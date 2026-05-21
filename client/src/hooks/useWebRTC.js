import { useEffect, useRef, useState, useMemo } from 'react';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export function useWebRTC(socket, activeRoom) {
  const peerConnectionRef = useRef(null);
  const [p2pStatus, setP2pStatus] = useState('Disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!activeRoom) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onconnectionstatechange = () => setP2pStatus(pc.connectionState);

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc-ice-candidate', { room: activeRoom, candidate: e.candidate });
    };

    // Signaling listeners
    socket.on('webrtc-offer', async (data) => {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { target: data.sender, answer });
    });

    socket.on('webrtc-answer', async (data) => {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      if (data.candidate) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    return () => {
      pc.close();
      peerConnectionRef.current = null;
    };
  }, [activeRoom]); // Socket dependency hata di hai

  return { p2pStatus, isReconnecting };
}