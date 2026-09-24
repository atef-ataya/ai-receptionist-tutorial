import { loadEnvFile } from "node:process";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (process.env.NODE_ENV === "production") { process.env.APP_MODE = "live"; }
const config = readConfig();
const host = "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const server = createApp(config).listen(port, host, () => {
  console.log(`Velo API listening on http://${host}:${port} (${config.APP_MODE} mode)`);
});

function shutdown() { server.close(() => process.exit(0)); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
