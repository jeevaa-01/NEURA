import Redis, { type RedisOptions } from "ioredis";

import { serverEnv } from "@/lib/validations/env";

/**
 * Redis backs caching today and will back Socket.IO pub/sub fan-out once the
 * realtime phase lands. Like Prisma, the connection is cached on `globalThis`
 * so hot reloads in development do not open a new socket per edit.
 */
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const options: RedisOptions = {
  // Connect on first command instead of at import time, so building the app or
  // rendering a page that never touches Redis does not require a live server.
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  // Back off up to 2s between reconnect attempts rather than hammering a
  // container that is still starting.
  retryStrategy: (times) => Math.min(times * 200, 2_000),
};

function createRedisClient(): Redis {
  return new Redis(serverEnv().REDIS_URL, options);
}

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (serverEnv().NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
