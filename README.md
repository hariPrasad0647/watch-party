# Watch Party Backend

This is Module 0 — Foundation of the Watch Party Backend.

Watch Party is a real-time media synchronization platform that will allow users to create watch rooms and watch media together in real-time.

## Current status

**Module 0 — Foundation**

This module provides the core project setup and infrastructure required to build future features.
**No business logic is implemented yet.**

## Stack

- **Runtime**: Node.js v20+
- **Language**: TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache/Queue/PubSub**: Redis
- **Realtime**: Socket.IO
- **Validation**: Zod
- **Logging**: Pino
- **Testing**: Vitest

## Requirements

- Node.js >= 20
- Docker and Docker Compose
- npm

## Installation

```bash
npm install
```

## Infrastructure

Start the supporting infrastructure (PostgreSQL and Redis) using Docker:

```bash
docker compose up -d
```

## Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Adjust the variables if necessary. The defaults work with the `docker-compose.yml` file.

## Database

Generate the Prisma client:

```bash
npm run db:generate
```

Run database migrations:

```bash
npm run db:migrate
```

## Development

Start the development server:

```bash
npm run dev
```

The server will be available at `http://localhost:3000`.

## Testing

Run unit and integration tests:

```bash
npm run test
```

## Architecture

This is a **Modular Monolith** designed for horizontal scaling.

- **Fastify** handles standard HTTP requests (health checks, and eventually REST APIs for users, rooms, etc.)
- **Socket.IO** shares the Fastify HTTP server and handles real-time bidirectional communication.
- **PostgreSQL** provides persistent storage.
- **Redis** provides transient high-speed state, and will eventually power the Socket.IO Redis Adapter to scale WebSocket connections across multiple instances, as well as BullMQ for background jobs.
