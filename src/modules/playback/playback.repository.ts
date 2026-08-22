import { redis } from '../../infrastructure/redis/index.js';
import { PlaybackState } from './playback.schema.js';

export class PlaybackRepository {
  private static getKey(roomId: string): string {
    return `room:${roomId}:playback`;
  }

  static async applyCommand(
    roomId: string,
    command: 'PLAY' | 'PAUSE' | 'SEEK' | 'RATE',
    payload: string = ''
  ): Promise<PlaybackState> {
    const key = this.getKey(roomId);
    const nowMs = Date.now().toString();
    const resultJson = await redis.applyPlaybackCommand(key, command, nowMs, payload, roomId);
    return JSON.parse(resultJson) as PlaybackState;
  }

  static async getStatus(roomId: string): Promise<PlaybackState> {
    const key = this.getKey(roomId);
    const nowMs = Date.now().toString();
    const resultJson = await redis.applyPlaybackCommand(key, 'STATUS', nowMs, '', roomId);
    return JSON.parse(resultJson) as PlaybackState;
  }

  static async deleteState(roomId: string): Promise<void> {
    const key = this.getKey(roomId);
    await redis.del(key);
  }
}
