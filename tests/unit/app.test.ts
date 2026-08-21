import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('App Initialization & Health Check', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should initialize and have /api/v1/health/live', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.status).toBe('alive');
  });

  it('should return 404 for unknown routes in a structured format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/unknown-route'
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    // Fastify default 404 handler can be overridden, but currently it returns standard fastify error
    // which our errorHandler catches if it's thrown, but default 404 is a bit different.
    // We just verify it returns a response.
  });
});
