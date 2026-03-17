# React + Vite + TypeScript Game App (Monorepo)

A minimal React application with Vite, TypeScript, and a Node.js backend for hosting multiplayer game sessions. Organized as a pnpm workspace monorepo.

## Features

- **2-Player Games Only**: All game sessions support exactly 2 players
- **Game Lobby**: Choose to host a new game or join an existing one
- **Available Games List**: See all open games waiting for a second player
- **Real-time Multiplayer**: Socket.io-based game session management
- **Full-page Canvas**: Responsive canvas that fills the entire viewport when in a game
- **TypeScript**: Full type safety across frontend, backend, and shared modules
- **Monorepo Structure**: Organized workspace with shared types and utilities

## Tech Stack

### Frontend (`packages/frontend`)
- React 19
- TypeScript
- Vite
- Socket.io Client

### Backend (`packages/backend`)
- Node.js
- Express
- Socket.io
- TypeScript

### Shared (`packages/shared`)
- TypeScript type definitions
- Shared interfaces and types
- Game session models

## Project Structure

```
├── packages/
│   ├── shared/           # Shared types and interfaces
│   │   ├── src/
│   │   │   └── index.ts  # Type definitions
│   │   ├── dist/         # Built types
│   │   └── package.json
│   ├── backend/          # Game server
│   │   ├── src/
│   │   │   └── server.ts # Server implementation
│   │   ├── dist/         # Built server
│   │   └── package.json
│   └── frontend/         # React app
│       ├── src/          # React components
│       ├── public/       # Static assets
│       ├── dist/         # Built app
│       └── package.json
├── pnpm-workspace.yaml   # Workspace configuration
└── package.json          # Root package.json
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- pnpm

### Installation

1. Clone the repository and install dependencies:
```bash
pnpm install
```

### Building Shared Types

The shared types are automatically built when building dependent packages (backend/frontend). No manual build step required!

### Running the Application

1. **Start the Backend Server** (in one terminal):
```bash
pnpm server
```
The server will run on `http://localhost:3001`

2. **Start the Frontend Dev Server** (in another terminal):
```bash
pnpm dev
```
The frontend will run on `http://localhost:5173`

### Game Session Management

The app features a complete 2-player game lobby system:

- **Host Game**: Create a new 2-player game session and wait for another player
- **Join Game**: Browse and join available games that need a second player
- **Waiting Room**: Shows session details and player count while waiting
- **Game Canvas**: Only appears when both players have joined and the game starts
- **Leave Game**: Players can leave at any time, returning to the lobby

### Game Flow

1. **Lobby**: Choose to host or join a game
2. **Waiting**: Host waits for a player to join, or guest waits for game to start
3. **Playing**: Full-screen canvas game when both players are connected
4. **Return**: Leave game to return to lobby

## API Endpoints

- `GET /api/sessions` - List all active 2-player game sessions with join status
- `POST /api/sessions` - Create a new 2-player game session

## Socket Events

### Client → Server
- `join-session` - Join a game session
- `leave-session` - Leave current session
- `game-action` - Send game actions to other players

### Server → Client
- `player-joined` - A player joined the session
- `player-left` - A player left the session
- `game-action` - Receive game actions from other players

## Development Scripts

### Root Level Scripts
- `pnpm build` - Build all packages (shared types built automatically)
- `pnpm build:backend` - Build backend + shared types
- `pnpm build:frontend` - Build frontend
- `pnpm dev` - Start frontend dev server
- `pnpm server` - Start backend server
- `pnpm server:dev` - Start backend server with auto-reload
- `pnpm lint` - Lint all packages
- `pnpm clean` - Clean all build artifacts
- `pnpm type-check` - Type check all packages

## Shared Types

The `@ih3t/shared` package contains:

- `GameSession` - Game session data structure
- `Player` - Player information
- `GameAction` - Game action payload
- Socket.io event type definitions
- API request/response types

**Automatic Inclusion**: The shared types are automatically built and included when building dependent packages (backend/frontend) thanks to TypeScript project references. No manual build step required!
