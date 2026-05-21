import { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
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

  const [latency, setLatency] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!activeRoom) {
      setP2pStatus('Disconnected');
      setLatency(null);
      setIsReconnecting(false);
      return;
    }

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
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime !== undefined) {
                setLatency(Math.round(report.currentRoundTripTime * 1000));
              }
            }
          });
        } catch (err) {
          console.debug('Telemetry skipped', err);
        }
      }, 2000);
    };

    const triggerIceRenegotiation = async () => {
      if (isReconnecting || !peerConnectionRef.current) return;

      setIsReconnecting(true);
      setP2pStatus('Reconnecting');

      try {
        const pc = peerConnectionRef.current;
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { room: activeRoom, offer });
      } catch (err) {
        console.error('ICE restart failed:', err);
      }
    };

    const initializePeer = async (targetPeerId = null) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;

      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setP2pStatus(state);

        if (state === 'connected') {
          setIsReconnecting(false);
          startNetworkTelemetryPolling(pc);
        } else if (state === 'disconnected' || state === 'failed') {
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
        if (event.streams?.[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const audioTrack = stream.getAudioTracks()[0];

        const streamAudioLevels = () => {
          if (!localStreamRef.current || !audioTrack?.enabled) {
            setLocalVolume(0);
            audioAnimationRef.current = requestAnimationFrame(streamAudioLevels);
            return;
          }

          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }

          const avg = sum / bufferLength;
          setLocalVolume(Math.min(Math.round((avg / 128) * 100), 100));

          audioAnimationRef.current = requestAnimationFrame(streamAudioLevels);
        };

        streamAudioLevels();

      } catch (err) {
        console.error('Mic access error:', err);
      }

      peerConnectionRef.current = pc;
      return pc;
    };

    socket.on('system-message', async (data) => {
      if (data?.text?.includes('joined')) {
        const pc = await initializePeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { room: activeRoom, offer });
      }
    });

    socket.on('webrtc-offer', async (data) => {
      const pc = await initializePeer(data.sender);

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc-answer', {
        target: data.sender,
        answer
      });
    });

    socket.on('webrtc-answer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      }
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } catch {}
      }
    });

    socket.on('peer-mute-status', setIsPeerMuted);

    return () => {
      socket.off('system-message');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('peer-mute-status');

      clearInterval(statsIntervalRef.current);
      cancelAnimationFrame(audioAnimationRef.current);

      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
    };
  }, [socket, activeRoom]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);

      socket.emit('mute-status-change', {
        room: activeRoom,
        isMuted: !track.enabled
      });
    }
  };

  return {
    p2pStatus,
    isMuted,
    isPeerMuted,
    toggleMute,
    localVolume,
    latency,
    isReconnecting
  };
}