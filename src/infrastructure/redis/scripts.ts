import { Redis } from 'ioredis';
import { redis } from './index.js';

const applyPlaybackCommandLua = `
local key = KEYS[1]
local cmd = ARGV[1]
local nowMs = tonumber(ARGV[2])
local argPayload = ARGV[3]
local roomIdArg = ARGV[4]

local stateJson = redis.call('GET', key)
local state

if not stateJson then
  state = {
    roomId = roomIdArg,
    version = 0,
    status = 'PAUSED',
    basePositionMs = 0,
    playbackRate = 1,
    serverTimestamp = nowMs,
    mediaId = cjson.null
  }
else
  state = cjson.decode(stateJson)
end

-- Calculate current position
local currentPositionMs = state.basePositionMs
if state.status == 'PLAYING' then
  local elapsedMs = nowMs - state.serverTimestamp
  if elapsedMs < 0 then elapsedMs = 0 end
  currentPositionMs = currentPositionMs + math.floor(elapsedMs * state.playbackRate)
end

-- Apply command
if cmd == 'PLAY' then
  state.basePositionMs = currentPositionMs
  state.status = 'PLAYING'
  state.serverTimestamp = nowMs
elseif cmd == 'PAUSE' then
  state.basePositionMs = currentPositionMs
  state.status = 'PAUSED'
  state.serverTimestamp = nowMs
elseif cmd == 'SEEK' then
  state.basePositionMs = tonumber(argPayload)
  -- status remains unchanged
  -- playbackRate remains unchanged
  state.serverTimestamp = nowMs
elseif cmd == 'RATE' then
  state.basePositionMs = currentPositionMs
  state.playbackRate = tonumber(argPayload)
  state.serverTimestamp = nowMs
elseif cmd == 'STATUS' then
  -- Do nothing, just return current state (which may have been newly initialized)
  local newStateJson = cjson.encode(state)
  -- If it was missing, we must save the initialized state
  if not stateJson then
    redis.call('SET', key, newStateJson)
  end
  return newStateJson
else
  return cjson.encode({ error = 'UNKNOWN_COMMAND' })
end

state.version = state.version + 1

local newStateJson = cjson.encode(state)
redis.call('SET', key, newStateJson)

return newStateJson
`;

export function initializeRedisScripts(redisClient: Redis) {
  redisClient.defineCommand('applyPlaybackCommand', {
    numberOfKeys: 1,
    lua: applyPlaybackCommandLua
  });
}

declare module 'ioredis' {
  interface Redis {
    applyPlaybackCommand(
      key: string,
      cmd: 'PLAY' | 'PAUSE' | 'SEEK' | 'RATE' | 'STATUS',
      nowMs: string,
      payload: string,
      roomId: string
    ): Promise<string>;
  }
}
