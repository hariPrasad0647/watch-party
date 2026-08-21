# Architecture Document

## Overview

This project is structured as a **Modular Monolith**. We have specifically avoided microservices to keep operational complexity low while still allowing horizontal scaling.

## Current Foundation (Module 0)

The current implementation provides the core plumbing:

```text
Client
   ↓
HTTP / WebSocket
   ↓
Fastify + Socket.IO
   ↓
Application infrastructure
   ↓
PostgreSQL / Redis
```

### Components

- **Fastify**: The HTTP framework chosen for its high performance and low overhead.
- **Socket.IO**: The WebSocket framework. Currently implements basic connection and ping/pong.
- **PostgreSQL**: The primary relational database. Accessed via Prisma ORM. Used for persistent data (future: users, rooms, history).
- **Redis**: The in-memory data store. Used for transient/high-speed state (future: rate limiting, presence, queues, distributed coordination).

## Future Direction

Future modules will build upon this foundation:

- **Auth**: Will introduce JWT and Argon2, securing HTTP endpoints and Socket.IO connections.
- **Users**: Profile management (PostgreSQL).
- **Rooms**: Room creation and configuration (PostgreSQL).
- **Participants**: Managing who is in which room (Redis for presence, PostgreSQL for historical records).
- **Realtime / Playback**: High-frequency sync events.
- **Chat**: In-room messaging.

### Database vs Redis Strategy

- **PostgreSQL**: Used for all durable, persistent state. This includes user accounts, room settings, saved messages, watch history, and billing records.
- **Redis**: Used for high-frequency, transient data. This includes who is currently online in a room (presence), rate limiting counters, background job queues (BullMQ), Socket.IO Pub/Sub adapter, and temporary playback sync states. We will NOT store every playback event in PostgreSQL.

### Socket.IO Scaling

When we scale beyond one Node.js instance, we will use `@socket.io/redis-adapter` powered by our Redis cluster to ensure a message published to a room reaches all connected clients, regardless of which backend instance they are connected to.
