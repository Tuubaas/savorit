import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazily initialise so importing this module during build (without DATABASE_URL)
// doesn't throw. The connection is created on first property access.
let _db: NeonHttpDatabase<typeof schema> | undefined;

function getInstance(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle({ client: neon(process.env.DATABASE_URL!), schema });
  }
  return _db;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop: string | symbol) {
    const instance = getInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as Function).bind(instance)
      : value;
  },
});
