import { Redis } from 'ioredis';


const applyPlaybackCommandLua = `
local key = KEYS[1]
local cmd = ARGV[1]
local nowMs = tonumber(ARGV[2])
local argPayload = ARGV[3]
local roomIdArg = ARGV[4]
local expectedMediaIdArg = ARGV[5]

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

-- Validate expectedMediaId for playback commands
if cmd == 'PLAY' or cmd == 'PAUSE' or cmd == 'SEEK' or cmd == 'RATE' then
  if state.mediaId ~= cjson.null and expectedMediaIdArg ~= '' and expectedMediaIdArg ~= state.mediaId then
    return cjson.encode({ error = 'STALE_COMMAND' })
  end
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
elseif cmd == 'SET_MEDIA' then
  state.mediaId = argPayload
  state.status = 'PAUSED'
  state.basePositionMs = 0
  state.playbackRate = 1
  state.serverTimestamp = nowMs
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
      cmd: 'PLAY' | 'PAUSE' | 'SEEK' | 'RATE' | 'STATUS' | 'SET_MEDIA',
      nowMs: string,
      payload: string,
      roomId: string,
      expectedMediaId: string
    ): Promise<string>;
  }
}
