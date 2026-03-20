# Infinity Hexagonial Tic-Tac-Toe

Small monorepo for a real-time 2-player game inspired by the following YouTube video from webgoatguy:
https://www.youtube.com/watch?v=Ob6QINTMIOA

Official website:
https://hex-tic-tac-toe.did.science/

## Stack

- React + Vite + TypeScript
- Node.js + Express + Socket.io
- pnpm workspace

## Development

```bash
pnpm install
pnpm dev:frontend
pnpm dev:backend
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

Backend startup requires `MONGODB_URI` to be set. `MONGODB_DB_NAME` remains optional and defaults to `ih3t`.
Optional backend env vars: `FRONTEND_DIST_PATH`, `LOG_LEVEL`, `LOG_PRETTY`, and `REMATCH_TTL_MS`.
Server logs are printed to the console and also written to `logs/server.log`, rotating in 50 MB segments with a 500 MB total cap.

While the backend is running, type `shutdown` into the backend terminal and press Enter to schedule a graceful shutdown.
This immediately blocks new games, gives existing sessions up to 10 minutes to finish, and then closes any remaining sessions before the server exits.
Sending `SIGINT` or `SIGTERM` now follows the same graceful path on the first and second signal; the process exits immediately only after the third signal.

## AI Use
> This project was built mostly with AI-assisted "vibe coding" techniques.

Why?  
I wanted to experiment with AI coding systems, especially GPT-based ones, and this project felt like a good fit. I already have a strong background in web development and in this tech stack, but using AI to build the initial prototype helped speed things up considerably.
