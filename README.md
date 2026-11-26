# radio-camera-bridge

Node (zero deps) bridge: OHGO cameras + radio call events -> nearest camera via SSE.

## Run
```
OHGO_API_KEY=... npm start
```
Docker:
```
OHGO_API_KEY=... docker compose up -d
```
Port 8090 (host) -> 8080.

## Endpoints
- GET /api/cameras (proxies OHGO with env key)
- POST /api/radio-call {lat,lng,...} (stores lastCall, broadcasts SSE)
- GET /api/state
- GET /events (SSE)
