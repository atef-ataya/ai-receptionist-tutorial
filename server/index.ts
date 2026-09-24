import { loadEnvFile } from "node:process";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const config = readConfig();
const server = createApp(config).listen(config.PORT, () => {
  console.log(`Velo API listening on http://localhost:${config.PORT} (${config.APP_MODE} mode)`);
});

function shutdown() { server.close(() => process.exit(0)); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
