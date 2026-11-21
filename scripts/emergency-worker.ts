import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { getDb } from "../src/server/db";
import { processEmergencyExpiry } from "../src/server/services/emergency-cover";

const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

try {
  do {
    try {
      const { expired, failed } = await processEmergencyExpiry();
      if (expired || process.argv.includes("--once")) console.log(`Emergency rounds expired: ${expired}`);
      if (failed && process.argv.includes("--once")) process.exitCode = 1;
    } catch (error) {
      console.error("Emergency expiry could not read the queue", error instanceof Error ? error.name : "Unknown error");
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once") || stop.signal.aborted) break;
    await setTimeout(2000, undefined, { signal: stop.signal }).catch(error => {
      if (!stop.signal.aborted) throw error;
    });
  } while (!stop.signal.aborted);
} finally {
  await getDb().$disconnect();
}
