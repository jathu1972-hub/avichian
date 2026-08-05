import { api } from './api';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type CallIceConfig = {
  iceServers: IceServerConfig[];
  livekitUrl: string | null;
  mediaMode: 'livekit' | 'webrtc';
};

export async function fetchCallIceConfig(): Promise<CallIceConfig> {
  const res = await api<CallIceConfig>('/calls/ice-config');
  return (
    res.data ?? {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      livekitUrl: null,
      mediaMode: 'webrtc',
    }
  );
}

export async function fetchLiveKitToken(callId: string) {
  const res = await api<{
    token: string;
    url: string;
    roomName: string;
    identity: string;
  }>(`/calls/${callId}/livekit-token`, { method: 'POST', body: '{}' });
  return res.data!;
}

export async function startCall(receiverId: string, type: 'VOICE' | 'VIDEO') {
  const res = await api<{
    id: string;
    type: string;
    status: string;
    roomName: string | null;
    mediaMode?: 'livekit' | 'webrtc';
    livekitUrl?: string | null;
    peer?: { id: string; name: string; profilePhotoUrl: string | null };
  }>('/calls/start', {
    method: 'POST',
    body: JSON.stringify({ receiverId, type }),
  });
  return res.data!;
}

export async function updateCallStatus(
  callId: string,
  status: 'MISSED' | 'REJECTED' | 'COMPLETED' | 'FAILED' | 'RINGING',
  duration = 0,
) {
  await api(`/calls/${callId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, duration }),
  });
}

export async function fetchCallHistory() {
  const res = await api('/calls/history');
  return res.data!;
}
