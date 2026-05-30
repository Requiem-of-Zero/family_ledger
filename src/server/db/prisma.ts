// src/server/db/prisma.ts
import "dotenv/config";

import { PrismaClient } from "@/app/generated/prisma";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=UTC",
});

const adapter = new PrismaPg(pool);

const REQUIRED_MODEL_DELEGATES = [
  "familyJoinRequest",
  "sharingProfile",
  "transactionShare",
] as const;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function hasRequiredModelDelegates(client: PrismaClient) {
  // During local schema work, Next can keep an older PrismaClient on globalThis
  // after the generated client changes. Recreate it if new model delegates are
  // missing so fresh pages do not crash until the dev server is restarted.
  return REQUIRED_MODEL_DELEGATES.every((delegate) => delegate in client);
}

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

const cachedPrisma = globalForPrisma.prisma;

export const prisma =
  cachedPrisma && hasRequiredModelDelegates(cachedPrisma)
    ? cachedPrisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
