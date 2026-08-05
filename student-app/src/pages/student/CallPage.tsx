import {
  FlipHorizontal2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Signal,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Room, RoomEvent, Track, createLocalTracks, type LocalTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { stopIncomingRingtone } from '../../lib/ringtone';
import {
  fetchCallIceConfig,
  fetchLiveKitToken,
  type CallIceConfig,
  updateCallStatus,
} from '../../lib/calls';
import { connectSocket } from '../../lib/socket';

type SignalPayload =
  | { type: 'ready' }
  | { type: 'accepted'; callId?: string }
  | {
      type: 'invite';
      callId: string;
      callType: string;
      fromUserId: string;
      fromName?: string;
      roomName?: string;
    }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'hangup'; reason?: string }
  | { type: 'reject' };

const RING_TIMEOUT_MS = 50_000;

function qualityFromStats(rttMs: number | null, packetLoss: number | null): string {
  if (rttMs == null && packetLoss == null) return '—';
  if ((rttMs != null && rttMs > 400) || (packetLoss != null && packetLoss > 0.08)) return 'Weak';
  if ((rttMs != null && rttMs > 200) || (packetLoss != null && packetLoss > 0.03)) return 'Fair';
  return 'Good';
}

/**
 * Production-ready 1:1 call page.
 * - LiveKit SFU when server provides LIVEKIT_URL
 * - Otherwise mesh WebRTC with server ICE/TURN config
 * Signaling always via authenticated Socket.IO.
 */
export function CallPage({ mode }: { mode: 'voice' | 'video' }) {
  const { userId: peerId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const callId = params.get('callId');
  const role = (params.get('role') === 'callee' ? 'callee' : 'caller') as 'caller' | 'callee';
  const peerName = params.get('name') || `Peer ${(peerId ?? '').slice(0, 8)}`;
  const roomFromQuery = params.get('room') || '';

  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState(role === 'caller' ? 'Calling…' : 'Connecting…');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [quality, setQuality] = useState('—');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mirrorSelf, setMirrorSelf] = useState(true);
  const [switchingCam, setSwitchingCam] = useState(false);
  const [mediaMode, setMediaMode] = useState<'livekit' | 'webrtc'>('webrtc');
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const videoDeviceIdsRef = useRef<string[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const endedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const answeringRef = useRef(false);
  const offerSentRef = useRef(false);
  /** True after we successfully applied a local answer (prevents double answer). */
  const answerSentRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const lastRemoteOfferKeyRef = useRef<string>('');
  const lastRemoteAnswerKeyRef = useRef<string>('');
  const secondsRef = useRef(0);
  const connectedRef = useRef(false);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const pendingSignals = useRef<SignalPayload[]>([]);
  const pcReadyRef = useRef(false);
  const peerAcceptedRef = useRef(role === 'callee'); // callee is already accepted
  const iceConfigRef = useRef<CallIceConfig | null>(null);
  /** Serialize all SDP/ICE processing so concurrent socket events cannot race. */
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());

  function sdpKey(sdp: RTCSessionDescriptionInit | undefined): string {
    return `${sdp?.type ?? ''}:${(sdp?.sdp ?? '').slice(0, 160)}`;
  }

  function isBenignSdpError(msg: string): boolean {
    return /setLocalDescription|setRemoteDescription|wrong state|stable|have-local-offer|have-remote-offer|Called in wrong state|InvalidStateError|m-lines|SessionDescription/i.test(
      msg,
    );
  }

  /**
   * Log signaling issues. Never show raw WebRTC stack traces on the call UI.
   * If media is already connected, stay silent for the user.
   */
  function reportSignalingIssue(err: unknown, context: string) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[call] ${context}:`, msg, {
      signalingState: pcRef.current?.signalingState,
      connectionState: pcRef.current?.connectionState,
      iceConnectionState: pcRef.current?.iceConnectionState,
    });
    // Connected (or connecting with media) → no UI noise
    if (connectedRef.current || endedRef.current) return;
    if (isBenignSdpError(msg)) return;
    // Only surface real failures
    setError('Connection issue — trying to recover…');
  }

  function clearUiErrorIfConnected() {
    if (connectedRef.current) {
      setError('');
    }
  }

  const emitSignal = useCallback(
    (signal: SignalPayload) => {
      if (!peerId) return;
      const socket = connectSocket();
      // Single channel for SDP/ICE — named hangup/reject only for hangup lifecycle
      socket.emit('call:signal', {
        toUserId: peerId,
        type: mode === 'video' ? 'VIDEO' : 'VOICE',
        callId,
        signal,
      });
      if (signal.type === 'hangup') {
        socket.emit('callEnded', { toUserId: peerId, callId, reason: signal.reason });
      } else if (signal.type === 'reject') {
        socket.emit('callRejected', { toUserId: peerId, callId });
      }
      // Do not re-emit callAccepted here — banner already notified the peer
    },
    [peerId, mode, callId],
  );

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;
    localTracksRef.current.forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    localTracksRef.current = [];
    if (roomRef.current) {
      try {
        void roomRef.current.disconnect();
      } catch {
        /* ignore */
      }
      roomRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onnegotiationneeded = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pcReadyRef.current = false;
  }, []);

  const endCall = useCallback(
    async (final: 'COMPLETED' | 'REJECTED' | 'MISSED' | 'FAILED' = 'COMPLETED', notifyPeer = true) => {
      if (endedRef.current) return;
      endedRef.current = true;
      if (notifyPeer) {
        emitSignal({ type: 'hangup', reason: final });
      }
      cleanupMedia();
      if (callId) {
        try {
          await updateCallStatus(callId, final, secondsRef.current);
        } catch {
          /* ignore */
        }
      }
      navigate('/home/chat', { replace: true });
    },
    [callId, cleanupMedia, emitSignal, navigate],
  );

  useEffect(() => {
    if (!peerId) {
      setError('Missing peer for call');
      return;
    }

    let cancelled = false;
    const socket = connectSocket();
    // polite peer = callee (avoids glare); caller is impolite
    const isPolite = role === 'callee';

    async function createAndSendOffer() {
      const pc = pcRef.current;
      if (!pc || !pcReadyRef.current) return;
      if (makingOfferRef.current || offerSentRef.current) return;
      // Only create an offer from a stable (no local/remote offer pending) state
      if (pc.signalingState !== 'stable') {
        console.warn('[call] skip createOffer, state=', pc.signalingState);
        return;
      }
      // Claim the offer slot before any await (prevents dual accepted/ready race)
      makingOfferRef.current = true;
      offerSentRef.current = true;
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: mode === 'video',
        });
        if (pc.signalingState !== 'stable') {
          console.warn('[call] abort setLocalDescription(offer), state changed to', pc.signalingState);
          offerSentRef.current = false;
          return;
        }
        await pc.setLocalDescription(offer);
        emitSignal({ type: 'offer', sdp: pc.localDescription ?? offer });
        setStatus('Ringing…');
      } catch (err) {
        offerSentRef.current = false;
        reportSignalingIssue(err, 'createOffer/setLocalDescription');
      } finally {
        makingOfferRef.current = false;
      }
    }

    async function flushIce() {
      const pc = pcRef.current;
      if (!pc?.remoteDescription) return;
      const queued = pendingIce.current.splice(0);
      for (const c of queued) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
    }

    async function processSignal(signal: SignalPayload) {
      if (signal.type === 'ready' || signal.type === 'accepted') {
        // Dedup dual-channel accepted/ready; still allow offer if first race lost the claim
        if (peerAcceptedRef.current && offerSentRef.current) return;
        peerAcceptedRef.current = true;
        setStatus('Answered — connecting…');
        if (role === 'caller' && iceConfigRef.current?.mediaMode !== 'livekit') {
          await createAndSendOffer();
        }
        return;
      }
      if (signal.type === 'hangup' || signal.type === 'reject') {
        void endCall(signal.type === 'reject' ? 'REJECTED' : 'COMPLETED', false);
        return;
      }

      // LiveKit path ignores SDP/ICE
      if (iceConfigRef.current?.mediaMode === 'livekit') return;

      if (!pcReadyRef.current || !pcRef.current) {
        pendingSignals.current.push(signal);
        return;
      }
      const pc = pcRef.current;

      try {
        if (signal.type === 'offer' && signal.sdp) {
          const key = sdpKey(signal.sdp);

          // Already answered this call (or this exact offer)
          if (answerSentRef.current) {
            console.warn('[call] ignore offer — answer already sent');
            return;
          }
          if (key && key === lastRemoteOfferKeyRef.current) {
            console.warn('[call] ignore duplicate offer');
            return;
          }
          if (answeringRef.current) {
            console.warn('[call] ignore offer, already answering');
            return;
          }

          const state = pc.signalingState;
          const offerCollision = makingOfferRef.current || state !== 'stable';
          ignoreOfferRef.current = !isPolite && offerCollision;
          if (ignoreOfferRef.current) {
            console.warn('[call] ignore offer (glare, impolite)', state);
            return;
          }

          // Only accept offers when we can move to have-remote-offer
          // stable → new offer; have-local-offer → polite glare (rollback); have-remote-offer → only if different SDP
          if (state === 'have-remote-offer' && pc.currentRemoteDescription) {
            if (sdpKey(pc.currentRemoteDescription) === key) {
              console.warn('[call] ignore re-delivery of same remote offer');
              return;
            }
            // Different re-offer while still answering → ignore (single answer only)
            console.warn('[call] ignore new offer while already have-remote-offer');
            return;
          }
          if (state === 'have-local-pranswer' || state === 'have-remote-pranswer') {
            return;
          }
          if (state !== 'stable' && state !== 'have-local-offer') {
            console.warn('[call] skip offer in state', state);
            return;
          }

          // Claim immediately (before any await) so dual sockets cannot double-answer
          answeringRef.current = true;
          lastRemoteOfferKeyRef.current = key;
          try {
            await pc.setRemoteDescription(signal.sdp);
            await flushIce();

            // MUST only create/set answer when have-remote-offer
            if (pc.signalingState !== 'have-remote-offer') {
              console.warn(
                '[call] skip createAnswer — signalingState is',
                pc.signalingState,
              );
              return;
            }
            if (answerSentRef.current) {
              console.warn('[call] skip createAnswer — answer already sent');
              return;
            }

            const answer = await pc.createAnswer();

            // Re-check after async createAnswer — never setLocalDescription(answer) in stable
            if (pc.signalingState !== 'have-remote-offer') {
              console.warn(
                '[call] skip setLocalDescription(answer) — state became',
                pc.signalingState,
              );
              return;
            }
            if (answerSentRef.current) return;

            await pc.setLocalDescription(answer);
            answerSentRef.current = true;
            emitSignal({ type: 'answer', sdp: pc.localDescription ?? answer });
            setStatus('Connecting…');
            setError('');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Race: second answer after state already stable — not a user-facing failure
            if (isBenignSdpError(msg) || /stable/i.test(msg)) {
              console.warn('[call] benign SDP race (ignored):', msg);
              // If we already have a local answer, mark as sent
              if (pc.localDescription?.type === 'answer') {
                answerSentRef.current = true;
              }
              return;
            }
            throw err;
          } finally {
            answeringRef.current = false;
          }
        } else if (signal.type === 'answer' && signal.sdp) {
          const key = sdpKey(signal.sdp);
          if (key && key === lastRemoteAnswerKeyRef.current) {
            console.warn('[call] ignore duplicate answer');
            return;
          }
          // Only apply remote answer while we have a local offer out
          if (pc.signalingState !== 'have-local-offer') {
            // Already stable = answer already applied (duplicate) — ignore quietly
            if (pc.signalingState === 'stable' && pc.currentRemoteDescription) {
              lastRemoteAnswerKeyRef.current = key;
              return;
            }
            console.warn(
              '[call] skip setRemoteDescription(answer) — signalingState is',
              pc.signalingState,
            );
            return;
          }
          try {
            await pc.setRemoteDescription(signal.sdp);
            lastRemoteAnswerKeyRef.current = key;
            await flushIce();
            setStatus('Connecting…');
            setError('');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (isBenignSdpError(msg)) {
              console.warn('[call] benign answer apply race (ignored):', msg);
              lastRemoteAnswerKeyRef.current = key;
              return;
            }
            throw err;
          }
        } else if (signal.type === 'ice' && signal.candidate) {
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(signal.candidate);
            } catch (err) {
              console.warn('[call] addIceCandidate ignored', err);
            }
          } else {
            pendingIce.current.push(signal.candidate);
          }
        }
      } catch (err) {
        reportSignalingIssue(err, 'processSignal');
      }
    }

    /** Single-flight queue: dual Socket.IO events never run createAnswer in parallel. */
    function enqueueSignal(signal: SignalPayload) {
      signalQueueRef.current = signalQueueRef.current
        .then(() => processSignal(signal))
        .catch((err) => {
          reportSignalingIssue(err, 'signalQueue');
        });
      return signalQueueRef.current;
    }

    async function drainPendingSignals() {
      const batch = pendingSignals.current.splice(0);
      for (const s of batch) {
        await enqueueSignal(s);
      }
    }

    async function setupLiveKit(roomName: string) {
      if (!callId) throw new Error('Missing call id for LiveKit');
      setStatus('Joining room…');
      const { token, url } = await fetchLiveKitToken(callId);
      if (!url) throw new Error('LiveKit URL missing');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
        videoCaptureDefaults:
          mode === 'video'
            ? { resolution: { width: 1280, height: 720 }, facingMode: 'user' }
            : undefined,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = remoteAudioRef.current;
          if (el) {
            track.attach(el);
            void el.play().catch(() => undefined);
          }
        }
        if (track.kind === Track.Kind.Video && mode === 'video') {
          const el = remoteVideoRef.current;
          if (el) {
            track.attach(el);
            void el.play().catch(() => undefined);
          }
        }
        connectedRef.current = true;
        setConnected(true);
        setStatus('Connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        if (!endedRef.current) {
          setStatus('Disconnected');
          void endCall('COMPLETED', false);
        }
      });

      room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting…'));
      room.on(RoomEvent.Reconnected, () => setStatus('Connected'));

      await room.connect(url, token);

      const tracks = await createLocalTracks({
        audio: true,
        video: mode === 'video' ? { facingMode: 'user' } : false,
      });
      localTracksRef.current = tracks;
      for (const track of tracks) {
        if (track.kind === Track.Kind.Video && localVideoRef.current) {
          track.attach(localVideoRef.current);
        }
        await room.localParticipant.publishTrack(track);
      }

      if (role === 'callee') {
        // Banner already sent accepted — only signal media readiness
        emitSignal({ type: 'ready' });
      }
      setStatus(role === 'caller' ? 'Waiting for peer…' : 'In room…');
      // If remote already published
      for (const p of room.remoteParticipants.values()) {
        p.trackPublications.forEach((pub) => {
          if (pub.track) {
            if (pub.track.kind === Track.Kind.Audio && remoteAudioRef.current) {
              pub.track.attach(remoteAudioRef.current);
            }
            if (pub.track.kind === Track.Kind.Video && remoteVideoRef.current && mode === 'video') {
              pub.track.attach(remoteVideoRef.current);
            }
            connectedRef.current = true;
            setConnected(true);
            setStatus('Connected');
          }
        });
      }
      void roomName;
    }

    async function setupWebRtc(ice: CallIceConfig) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          mode === 'video'
            ? {
                facingMode: { ideal: facingModeRef.current },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => undefined);
      }

      const pc = new RTCPeerConnection({
        iceServers: ice.iceServers,
        iceCandidatePoolSize: 8,
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          emitSignal({ type: 'ice', candidate: ev.candidate.toJSON() });
        }
      };

      pc.ontrack = (ev) => {
        for (const track of ev.streams[0]?.getTracks() ?? [ev.track]) {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          void remoteVideoRef.current.play().catch(() => undefined);
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          connectedRef.current = true;
          setConnected(true);
          setStatus('Connected');
          setError(''); // never leave SDP noise on screen when audio works
        } else if (state === 'connecting') {
          setStatus('Connecting…');
        } else if (state === 'disconnected') {
          setStatus('Reconnecting…');
        } else if (state === 'failed') {
          console.warn('[call] connectionState=failed, restarting ICE');
          try {
            pc.restartIce();
            setStatus('Reconnecting…');
          } catch {
            if (!connectedRef.current) {
              setError('Call could not connect. Please try again.');
            }
            void endCall('FAILED', true);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce();
            setStatus('Reconnecting ICE…');
          } catch {
            /* ignore */
          }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStatus('Connected');
          connectedRef.current = true;
          setConnected(true);
          setError('');
          clearUiErrorIfConnected();
        } else if (pc.iceConnectionState === 'checking') {
          setStatus('Checking network…');
        }
      };

      pcReadyRef.current = true;
      await drainPendingSignals();

      if (role === 'callee') {
        setStatus('Connecting…');
        // Banner already sent accepted — only signal media readiness once
        emitSignal({ type: 'ready' });
      } else {
        setStatus('Calling…');
        // Wait for peer accepted/ready — do not offer early (main production fix)
        if (peerAcceptedRef.current) {
          await createAndSendOffer();
        }
      }
    }

    async function setup() {
      try {
        const ice = await fetchCallIceConfig();
        if (cancelled) return;
        iceConfigRef.current = ice;
        setMediaMode(ice.mediaMode);

        if (ice.mediaMode === 'livekit' && ice.livekitUrl && callId) {
          await setupLiveKit(roomFromQuery || `call-${callId}`);
        } else {
          await setupWebRtc(ice);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Camera/microphone permission denied or media unavailable',
        );
        setStatus('Media error');
      }
    }

    void setup();
    stopIncomingRingtone();

    function onSignal(payload: {
      fromUserId: string;
      signal: SignalPayload;
      callId?: string;
    }) {
      if (payload.fromUserId !== peerId) return;
      if (payload.callId && callId && payload.callId !== callId) return;
      void enqueueSignal(payload.signal);
    }

    // Named lifecycle aliases only — SDP must not be processed twice via dual channels.
    function onAccepted(payload: { fromUserId: string; callId?: string }) {
      if (payload.fromUserId !== peerId) return;
      if (peerAcceptedRef.current && offerSentRef.current) return;
      void enqueueSignal({ type: 'accepted', callId: payload.callId });
    }

    function onEnded(payload: { fromUserId: string; callId?: string }) {
      if (payload.fromUserId !== peerId) return;
      void enqueueSignal({ type: 'hangup' });
    }

    function onRejected(payload: { fromUserId: string }) {
      if (payload.fromUserId !== peerId) return;
      void enqueueSignal({ type: 'reject' });
    }

    socket.on('call:signal', onSignal);
    socket.on('callAccepted', onAccepted);
    socket.on('callEnded', onEnded);
    socket.on('callRejected', onRejected);

    const ringTimer =
      role === 'caller'
        ? window.setTimeout(() => {
            if (!endedRef.current && !connectedRef.current) {
              void endCall('MISSED', true);
            }
          }, RING_TIMEOUT_MS)
        : 0;

    const statsTimer = window.setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== 'connected') return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        let loss: number | null = null;
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && (r as RTCIceCandidatePairStats).state === 'succeeded') {
            const pair = r as RTCIceCandidatePairStats;
            if (typeof pair.currentRoundTripTime === 'number') {
              rtt = pair.currentRoundTripTime * 1000;
            }
          }
          if (r.type === 'inbound-rtp') {
            const inbound = r as RTCInboundRtpStreamStats;
            if (
              inbound.kind === 'audio' ||
              inbound.kind === 'video' ||
              (inbound as { mediaType?: string }).mediaType
            ) {
              if (inbound.packetsLost != null && inbound.packetsReceived != null) {
                const total = inbound.packetsLost + inbound.packetsReceived;
                if (total > 0) loss = inbound.packetsLost / total;
              }
            }
          }
        });
        setQuality(qualityFromStats(rtt, loss));
      } catch {
        /* ignore */
      }
    }, 3000);

    return () => {
      cancelled = true;
      if (ringTimer) window.clearTimeout(ringTimer);
      window.clearInterval(statsTimer);
      socket.off('call:signal', onSignal);
      socket.off('callAccepted', onAccepted);
      socket.off('callEnded', onEnded);
      socket.off('callRejected', onRejected);
      if (!endedRef.current) {
        emitSignal({ type: 'hangup', reason: 'left' });
        cleanupMedia();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId, mode, callId, role]);

  useEffect(() => {
    if (!connected) return;
    // Call is healthy — never leave a stale WebRTC error banner up
    setError('');
    const timer = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        secondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    localTracksRef.current.forEach((t) => {
      if (t.kind === Track.Kind.Audio) {
        if (muted) t.mute();
        else t.unmute();
      }
    });
  }, [muted]);

  useEffect(() => {
    if (mode !== 'video') return;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !camOff;
    });
    localTracksRef.current.forEach((t) => {
      if (t.kind === Track.Kind.Video) {
        if (camOff) t.mute();
        else t.unmute();
      }
    });
  }, [camOff, mode]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !speakerOn;
      remoteAudioRef.current.volume = speakerOn ? 1 : 0;
    }
  }, [speakerOn]);

  async function acquireVideoTrack(next: 'user' | 'environment'): Promise<MediaStreamTrack> {
    // Enumerate cameras when possible for reliable front/back switch
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      videoDeviceIdsRef.current = cams.map((c) => c.deviceId).filter(Boolean);
      if (cams.length > 1) {
        const currentId = localStreamRef.current?.getVideoTracks()[0]?.getSettings()?.deviceId;
        const other =
          cams.find((c) => c.deviceId && c.deviceId !== currentId) ??
          cams[next === 'environment' ? cams.length - 1 : 0];
        if (other?.deviceId) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: other.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          return stream.getVideoTracks()[0];
        }
      }
    } catch {
      /* fall through to facingMode */
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: next },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    return stream.getVideoTracks()[0];
  }

  async function switchCamera(target?: 'user' | 'environment') {
    if (mode !== 'video' || switchingCam) return;
    const next: 'user' | 'environment' =
      target ?? (facingMode === 'user' ? 'environment' : 'user');
    setSwitchingCam(true);
    setError('');
    try {
      // Stop old track FIRST (mobile often allows only one camera session)
      if (roomRef.current) {
        const old = localTracksRef.current.find((t) => t.kind === Track.Kind.Video);
        if (old) {
          await roomRef.current.localParticipant.unpublishTrack(old);
          old.stop();
        }
        const tracks = await createLocalTracks({
          video: { facingMode: next },
          audio: false,
        });
        const video = tracks.find((t) => t.kind === Track.Kind.Video);
        if (video) {
          localTracksRef.current = localTracksRef.current.filter((t) => t.kind !== Track.Kind.Video);
          localTracksRef.current.push(video);
          if (localVideoRef.current) video.attach(localVideoRef.current);
          await roomRef.current.localParticipant.publishTrack(video);
        }
        facingModeRef.current = next;
        setFacingMode(next);
        setMirrorSelf(next === 'user');
        return;
      }

      if (!localStreamRef.current || !pcRef.current) return;
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }

      const newTrack = await acquireVideoTrack(next);
      if (!newTrack) throw new Error('No camera available');

      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video' || s.track == null);
      const videoSender =
        sender ??
        pcRef.current.getSenders().find((s) => !s.track || s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
      } else {
        pcRef.current.addTrack(newTrack, localStreamRef.current);
      }

      localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        void localVideoRef.current.play().catch(() => undefined);
      }
      if (camOff) newTrack.enabled = false;

      facingModeRef.current = next;
      setFacingMode(next);
      setMirrorSelf(next === 'user');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not switch camera';
      if (/NotFound|Overconstrained|no device/i.test(msg)) {
        setError(next === 'environment' ? 'Rear camera not available on this device' : 'Front camera not available');
      } else {
        setError(msg);
      }
    } finally {
      setSwitchingCam(false);
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="relative flex min-h-[80dvh] flex-col overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-float">
      {/* Background for voice / video shell */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
        <StudentAvatar name={peerName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold tracking-tight">{peerName}</p>
          <p className="truncate text-xs text-white/55">
            {status}
            {mode === 'video' ? ' · Video' : ' · Voice'}
            {mediaMode === 'livekit' ? ' · SFU' : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="font-mono text-sm tabular-nums text-white/90">
            {mm}:{ss}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
            <Signal size={11} className={quality === 'Good' ? 'text-emerald-400' : quality === 'Weak' ? 'text-rose-400' : 'text-amber-300'} />
            {quality}
          </span>
        </div>
      </header>

      {error ? (
        <p className="relative z-10 mx-4 mb-2 rounded-xl bg-rose-500/15 px-3 py-2 text-center text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {/* Media stage */}
      <div className="relative z-10 mx-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-black/40 sm:mx-5">
        {mode === 'video' ? (
          <>
            <video
              ref={remoteVideoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              autoPlay
            />
            <audio ref={remoteAudioRef} autoPlay playsInline />
            {/* Self preview — small PIP */}
            <div className="absolute bottom-4 right-4 z-20 overflow-hidden rounded-2xl border border-white/25 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <video
                ref={localVideoRef}
                className={`h-32 w-24 bg-slate-900 object-cover sm:h-36 sm:w-28 ${
                  mirrorSelf ? 'scale-x-[-1]' : ''
                }`}
                playsInline
                autoPlay
                muted
              />
            </div>
            {camOff ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/85">
                <VideoOff size={44} className="text-white/50" />
                <p className="text-sm text-white/50">Camera off</p>
              </div>
            ) : null}
            {!connected ? (
              <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
                <div className="rounded-2xl bg-black/40 px-4 py-3 text-sm text-white/80">{status}</div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
            <audio ref={remoteAudioRef} autoPlay playsInline />
            <div className="relative">
              <div className="absolute -inset-3 animate-pulse rounded-full bg-primary/20" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-4xl font-bold ring-4 ring-white/10">
                {peerName.slice(0, 1).toUpperCase()}
              </div>
            </div>
            <p className="text-sm text-white/50">{status}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="relative z-10 space-y-3 px-4 py-5 sm:px-6">
        {mode === 'video' ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={switchingCam}
              onClick={() => void switchCamera('user')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                facingMode === 'user' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'
              }`}
            >
              Front
            </button>
            <button
              type="button"
              disabled={switchingCam}
              onClick={() => void switchCamera('environment')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                facingMode === 'environment' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'
              }`}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setMirrorSelf((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                mirrorSelf ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/80'
              }`}
            >
              <FlipHorizontal2 size={12} /> Mirror
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <ControlBtn active={!muted} onClick={() => setMuted((v) => !v)} label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </ControlBtn>
          <ControlBtn active={speakerOn} onClick={() => setSpeakerOn((v) => !v)} label="Speaker">
            {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </ControlBtn>
          {mode === 'video' ? (
            <>
              <ControlBtn active={!camOff} onClick={() => setCamOff((v) => !v)} label="Camera">
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </ControlBtn>
              <ControlBtn
                active
                disabled={switchingCam}
                onClick={() => void switchCamera()}
                label="Switch camera"
              >
                <SwitchCamera size={22} className={switchingCam ? 'animate-spin' : ''} />
              </ControlBtn>
              <ControlBtn
                active={false}
                onClick={() => setError('Screen share coming soon')}
                label="Share screen"
              >
                <MonitorUp size={22} />
              </ControlBtn>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void endCall(connected ? 'COMPLETED' : 'REJECTED')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/40 transition hover:bg-rose-400"
            aria-label="End call"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlBtn({
  children,
  onClick,
  label,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition disabled:opacity-50 ${
        active ? 'bg-white/15 text-white' : 'bg-white/10 text-white/70'
      }`}
    >
      {children}
    </button>
  );
}
