import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(8787),
  OPENAI_BASE_URL: z.string().default(''),
  OPENAI_API_KEY: z.string().default('lm-studio'),
  OPENAI_MODEL: z.string().default(''),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  MARKET_CACHE_TTL_MS: z.coerce.number().int().positive().default(60 * 1000),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`)
}

export const env = parsedEnv.data