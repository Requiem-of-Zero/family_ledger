import { hashPassword } from "@/src/server/auth/password";
import { prisma } from "@/src/server/db/prisma";

async function main() {
  console.log("🌱 Seeding database...");
  const hashedPassword = await hashPassword("password123")

  // Ensure a user exists, if not; create one
  const user = await prisma.user.upsert({
    where: {
      email: "test@example.com"
    },
    update: {},
    create: {
      email: "test@example.com",
      passwordHash: hashedPassword,
      username: "testuser"
    }
  })

  // Clear existing transactions for clean reruns
  await prisma.transaction.deleteMany({
    where: {
      createdByUserId: user.id
    }
  })

  await prisma.transaction.createMany({
    data: [
      {
        createdByUserId: user.id,
        type: "EXPENSE",
        amountCents: 1299,
        occurredAt: new Date("2026-01-01"),
        merchant: "Starbucks",
        note: "Coffee",
      },
      {
        createdByUserId: user.id,
        type: "EXPENSE",
        amountCents: 4599,
        occurredAt: new Date("2026-01-02"),
        merchant: "Trader Joe's",
        note: "Groceries",
      },
      {
        createdByUserId: user.id,
        type: "INCOME",
        amountCents: 250000,
        occurredAt: new Date("2026-01-03"),
        merchant: "Payroll",
        note: "January paycheck",
      },
    ],
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });