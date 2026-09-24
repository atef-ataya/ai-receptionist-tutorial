import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  PORT: z.coerce.number().int().positive().default(3000),
  BUSINESS_ID: z.literal("velo").default("velo"),
  BUSINESS_TIMEZONE: z.literal("Asia/Dubai").default("Asia/Dubai"),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173")
});

export type ServerConfig = z.infer<typeof envSchema> & { allowedOrigins: string[] };

export function readConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = source.NODE_ENV ?? "development";
  const defaultAppMode = nodeEnv === "production" ? "live" : "demo";
  const appMode = (nodeEnv === "production" && source === process.env)
    ? "live"
    : (source.APP_MODE ?? defaultAppMode);
  const firebaseProjectId = source.FIREBASE_PROJECT_ID ||
    source.GOOGLE_CLOUD_PROJECT ||
    source.GCLOUD_PROJECT ||
    (nodeEnv === "production" ? (process.env.FIREBASE_PROJECT_ID || "ai-receptionist-8303d") : undefined);

  const config = envSchema.parse({
    ...source,
    APP_MODE: appMode,
    ...(firebaseProjectId ? { FIREBASE_PROJECT_ID: firebaseProjectId } : {})
  });
  if (config.NODE_ENV === "production" && config.APP_MODE === "demo") {
    throw new Error("Production cannot start in demo mode. Set APP_MODE=live and configure Firebase.");
  }
  if (config.APP_MODE === "live" && !config.FIREBASE_PROJECT_ID) {
    throw new Error("FIREBASE_PROJECT_ID is required in live mode.");
  }
  return { ...config, allowedOrigins: config.ALLOWED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean) };
}
