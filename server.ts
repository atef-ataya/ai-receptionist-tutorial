import { loadEnvFile } from "node:process";
import path from "node:path";
import express from "express";
import { createApp } from "./server/app.js";
import { readConfig } from "./server/config.js";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

if (process.env.NODE_ENV === "production") {
  process.env.APP_MODE = "live";
}

const config = readConfig();
const app = createApp(config);
const isProd = process.env.NODE_ENV === "production";
const host = "0.0.0.0";
const port = Number(process.env.PORT || 8080);

if (!isProd) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, host: "0.0.0.0", hmr: false },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const server = app.listen(port, host, () => {
  console.log(`Velo app running at http://${host}:${port} (${config.APP_MODE} mode)`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
