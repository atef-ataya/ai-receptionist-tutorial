import { describe, expect, it } from "vitest";
import { readConfig } from "../server/config.js";

describe("runtime configuration", () => {
  it("refuses production fixture mode", () => {
    expect(() => readConfig({ NODE_ENV: "production", APP_MODE: "demo" })).toThrow(/cannot start in demo mode/i);
  });

  it("requires a Firebase project in live mode", () => {
    expect(() => readConfig({ NODE_ENV: "development", APP_MODE: "live" })).toThrow(/FIREBASE_PROJECT_ID/);
  });
});
