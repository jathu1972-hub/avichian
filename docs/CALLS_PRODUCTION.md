# AVICHIAN Voice & Video Calls (Production)

## Architecture

```
Student A ──Socket.IO (invite/accept/SDP/ICE)──► Express API
Student B ──Socket.IO ◄────────────────────────┘
     │                                              │
     └──── WebRTC (STUN/TURN) or LiveKit SFU ───────┘
```

- **Signaling**: Socket.IO on the same backend (`/socket.io`), JWT-authenticated.
- **Media**:
  - **Default**: peer-to-peer WebRTC with ICE from `GET /api/calls/ice-config`
  - **Optional**: LiveKit when `LIVEKIT_URL` + API key/secret are set

## Backend env

```env
# Required for cross-network mobile calls
TURN_URLS=turn:YOUR_TURN_HOST:3478?transport=udp,turn:YOUR_TURN_HOST:3478?transport=tcp
TURN_USERNAME=avichian
TURN_CREDENTIAL=strong-secret

# Optional SFU
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

## Coturn (minimal)

Install Coturn on a VPS with a public IP. Example `turnserver.conf`:

```
listening-port=3478
fingerprint
lt-cred-mech
user=avichian:strong-secret
realm=avichian.com
external-ip=YOUR_PUBLIC_IP
```

Open UDP/TCP **3478** (and **5349** if TLS).

## Frontend

No extra env required for ICE if the API serves it. Socket uses the same origin as `VITE_API_URL` / `config.json` `apiUrl`.

Optional (legacy):

```env
VITE_TURN_URL=turn:...
VITE_TURN_USERNAME=...
VITE_TURN_PASSWORD=...
```

(Prefer server-side `GET /api/calls/ice-config`.)

## Call flow

1. `POST /api/calls/start` → DB row + socket invite to callee  
2. Callee accepts → navigates to Call page (`role=callee`)  
3. Emits `accepted` / `ready`  
4. Caller creates SDP offer (not before accept)  
5. ICE candidates exchanged  
6. Media connected → timer + quality  
7. Hangup → `POST /api/calls/:id/status` + socket hangup  

## Local test

1. Two browsers (or two devices on LAN) logged in as **friends**  
2. Backend + both clients with working sockets  
3. Call from Chat or Profile  

Same Wi‑Fi often works with STUN only. **Different networks need TURN or LiveKit.**

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/calls/ice-config` | STUN/TURN + media mode |
| POST | `/api/calls/start` | Start call + ring peer |
| POST | `/api/calls/:id/status` | MISSED / REJECTED / COMPLETED / FAILED |
| POST | `/api/calls/:id/livekit-token` | Join LiveKit room (if enabled) |
| GET | `/api/calls/history` | Call history |

Socket events: `call:signal`, `callInvitation`, `callAccepted`, `callRejected`, `callEnded`, `offer`, `answer`, `iceCandidate`.
