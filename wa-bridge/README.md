[README.md](https://github.com/user-attachments/files/28208146/README.md)
# wa-bridge — Multi-Session WhatsApp Bridge

Node.js microservice that connects Taskosphere to WhatsApp Web.
Uses [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) — no Meta API required.

## Setup

```bash
cd wa-bridge
npm install
node index.js
```

Runs on **port 3002** by default.

## Environment variables

| Variable         | Default                    | Description                                   |
|-----------------|----------------------------|-----------------------------------------------|
| `WA_BRIDGE_PORT` | `3002`                     | Port the bridge listens on                    |
| `BACKEND_URL`    | `http://localhost:8000`    | Taskosphere backend URL (for webhooks)        |

Set in your `.env` or deployment environment. The backend also needs:

```
WA_BRIDGE_URL=http://localhost:3002
```

## How it works

1. **Admin** opens WhatsApp Settings → Connected Numbers → clicks "Get QR"
2. Backend creates a new session via `POST /sessions`
3. Bridge boots a Baileys socket, generates a QR code
4. Frontend polls `/sessions/:id/qr` every 3 seconds and displays the QR image
5. User scans with their WhatsApp → session becomes `connected`
6. Bridge calls `POST /backend/whatsapp/webhook/connected` to persist the phone number
7. All subsequent sends go through `POST /send` with `{ to, message, sessionId }`

## Multiple numbers

Each WhatsApp number is an independent session stored in `./sessions/<sessionId>/`.
Sessions survive restarts — Baileys re-authenticates from saved credentials.

## API

| Method    | Path                 | Description                          |
|----------|----------------------|--------------------------------------|
| GET      | /sessions             | List all sessions                    |
| POST     | /sessions             | Create new session (start QR flow)   |
| GET      | /sessions/:id         | Get single session status            |
| GET      | /sessions/:id/qr      | Get QR code (base64 PNG)             |
| DELETE   | /sessions/:id         | Disconnect & delete session          |
| POST     | /send                 | Send message (picks first connected) |
| GET      | /status               | Legacy compat endpoint               |

## Production deployment

For Render / Railway / Fly.io:
- Run as a separate service alongside your Python backend
- Persist the `./sessions/` directory with a volume mount so sessions survive redeploys
- Set `BACKEND_URL` to your production backend URL
