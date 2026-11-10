import { Redis } from "@upstash/redis";
import { checkBotId } from "botid/server";
import { createExplainHandlers } from "@/lib/explain/handlers";
import { EXPLAIN_MODEL, explanationParts } from "@/lib/explain/model";

// Streams for up to the model's own 60s timeout.
export const maxDuration = 90;

const redisConfigured =
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const { GET, POST } = createExplainHandlers({
  store: redisConfigured ? Redis.fromEnv() : null,
  secret: process.env.EXPLAIN_SECRET,
  model: EXPLAIN_MODEL,
  now: () => new Date(),
  isBot: async () => (await checkBotId()).isBot,
  explain: explanationParts,
  logError: (message, error) => console.error(message, error),
});
