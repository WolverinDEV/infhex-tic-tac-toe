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

Backend startup requires `MONGODB_URI`, `AUTH_SECRET`, `AUTH_DISCORD_ID` (or `DISCORD_CLIENT_ID`), and `AUTH_DISCORD_SECRET` (or `DISCORD_CLIENT_SECRET`) to be set. `MONGODB_DB_NAME` remains optional and defaults to `ih3t`.
Optional backend env vars: `FRONTEND_DIST_PATH`, `LOG_LEVEL`, `LOG_PRETTY`, and `REMATCH_TTL_MS`.
Discord OAuth must be configured with the backend callback URL:

```text
http://localhost:3001/auth/callback/discord
```

In production, use your deployed backend origin for the same `/auth/callback/discord` path.
Server logs are printed to the console and also written to `logs/server.log`, rotating in 50 MB segments with a 500 MB total cap.
In production, the backend injects route-aware Open Graph and Twitter meta tags for shared lobby invites and finished-game replay URLs so link previews show the correct page context.

While the backend is running, type `shutdown` into the backend terminal and press Enter to schedule a graceful shutdown.
This immediately blocks new games, gives existing sessions up to 10 minutes to finish, and then closes any remaining sessions before the server exits.
Sending `SIGINT` or `SIGTERM` now follows the same graceful path on the first and second signal; the process exits immediately only after the third signal.

When creating a match from the lobby, you can now choose whether the lobby is public or private. Public lobbies appear in the live browser, while private lobbies stay hidden and are intended for direct invites.
Lobby creation also stores a selected time control (`Unlimited`, `Turn Based`, or `Match Based` with increment), but the actual gameplay clock enforcement has not been implemented yet.
Discord sign-in is optional for live matches. Guests can play immediately, but only signed-in Discord accounts get a custom username. A new account is created automatically on first sign-in, the Discord username is used as the default in-game username, and that username can still be edited from the lobby afterwards.

## AI Use
> This project was built mostly with AI-assisted "vibe coding" techniques.

Why?  
I wanted to experiment with AI coding systems, especially GPT-based ones, and this project felt like a good fit. I already have a strong background in web development and in this tech stack, but using AI to build the initial prototype helped speed things up considerably.
