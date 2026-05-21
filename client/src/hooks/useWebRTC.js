import { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19002' },
    { urls: 'stun:stun1.l.google.com:19002' }
  ]
};

export function useWebRTC(socket, activeRoom) {
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(new Audio());
  const audioAnimationRef = useRef(null);
  const statsIntervalRef = useRef(null);

  const [p2pStatus, setP2pStatus] = useState('Disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [isPeerMuted, setIsPeerMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  
  // --- PHASE 10 NETWORK TELEMETRY STATES ---
  const [latency, setLatency] = useState(null); // Ping tracking in ms
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!activeRoom) {
      setP2pStatus('Disconnected');
      setLatency(null);
      setIsReconnecting(false);
      return;
    }

    // High-frequency automated health checker
    const startNetworkTelemetryPolling = (pc) => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      
      statsIntervalRef.current = setInterval(async () => {
        if (!pc || pc.connectionState !== 'connected') {
          setLatency(null);
          return;
        }

        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            // Target candidate-pair statistics to locate active transport latency
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime !== undefined) {
                // Convert fractional seconds into accurate millisecond metrics
                setLatency(Math.round(report.currentRoundTripTime * 1000));
              }
            }
          });
        } catch (err) {
          console.debug('Telemetry polling skipped metrics frame.', err);
        }
      }, 2000);
    };

    const triggerIceRenegotiation = async () => {
      if (isReconnecting || !peerConnectionRef.current) return;
      
      console.warn('⚠️ Network anomaly caught. Triggering clean ICE renegotiation loop...');
      setIsReconnecting(true);
      setP2pStatus('Reconnecting');

      try {
        const pc = peerConnectionRef.current;
        // Generate an ICE restart offer payload to establish clean peer routes
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { room: activeRoom, offer });
      } catch (err) {
        console.error('❌ ICE Renegotiation route failure:', err);
      }
    };

    const initializePeer = async (targetPeerId = null) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;

      console.log('🏗️ Initializing Adaptive WebRTC Mesh Core...');
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onconnectionstatechange = () => {
        const currentState = pc.connectionState;
        setP2pStatus(currentState);
        
        if (currentState === 'connected') {
          setIsReconnecting(false);
          startNetworkTelemetryPolling(pc);
        } else if (currentState === 'disconnected') {
          triggerIceRenegotiation();
        } else if (currentState === 'failed') {
          triggerIceRenegotiation();
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc-ice-candidate', {
            room: activeRoom,
            target: targetPeerId,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch((err) => 
            console.error('❌ Remote audio playback initialization error:', err)
          );
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Web Audio API Analysis Sub-Engine
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const streamAudioLevels = () => {
          if (!localStreamRef.current || audioTrack.enabled === false) {
            setLocalVolume(0);
            audioAnimationRef.current = requestAnimationFrame(streamAudioLevels);
            return;
          }
          
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const averageVolume = sum / bufferLength;
          setLocalVolume(Math.min(Math.round((averageVolume / 128) * 100), 100));
          audioAnimationRef.current = requestAnimationFrame(streamAudioLevels);
        };

        const audioTrack = stream.getAudioTracks()[0];
        streamAudioLevels();

      } catch (err) {
        console.error('❌ Hardware Microphone Lock Blocked:', err);
      }

      peerConnectionRef.current = pc;
      return pc;
    };

    // WebSocket Handshake Signals
    socket.on('system-message', async (data) => {
      if (data?.text?.includes('joined')) {
        const pc = await initializePeer();
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { room: activeRoom, offer });
        } catch (err) {
          console.error('❌ Offer creation crash:', err);
        }
      }
    });

    socket.on('webrtc-offer', async (data) => {
      const { offer, sender } = data;
      const pc = await initializePeer(sender);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { target: sender, answer });
      } catch (err) {
        console.error('❌ Answer handling exception:', err);
      }
    });

    socket.on('webrtc-answer', async (data) => {
      const { answer } = data;
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('❌ Setting Remote Description Failed:', err);
        }
      }
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      const { candidate } = data;
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.debug('ICE parsing edge case handled.', e);
        }
      }
    });

    socket.on('peer-mute-status', (status) => {
      setIsPeerMuted(status);
    });

    return () => {
      socket.off('system-message');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('peer-mute-status');
      
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (audioAnimationRef.current) cancelAnimationFrame(audioAnimationRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [socket, activeRoom, isReconnecting]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextMuteState = !audioTrack.enabled;
        audioTrack.enabled = nextMuteState;
        setIsMuted(!nextMuteState);
        socket.emit('mute-status-change', { room: activeRoom, isMuted: !nextMuteState });
      }
    }
  };

  return { p2pStatus, isMuted, isPeerMuted, toggleMute, localVolume, latency, isReconnecting };
}