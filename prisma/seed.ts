import { hashPassword } from "@/src/server/auth/password";
import { prisma } from "@/src/server/db/prisma";

const DEMO_PASSWORD = "password123";

const seedUsers = [
  { email: "test@example.com", username: "testuser" },
  { email: "alex@example.com", username: "alex" },
  { email: "jamie@example.com", username: "jamie" },
  { email: "morgan@example.com", username: "morgan" },
  { email: "pat@example.com", username: "pat" },
];

async function upsertSeedUsers(passwordHash: string) {
  const users = await Promise.all(
    seedUsers.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {
          username: user.username,
          passwordHash,
          deletedAt: null,
          isActive: true,
        },
        create: {
          email: user.email,
          username: user.username,
          passwordHash,
        },
      }),
    ),
  );

  return Object.fromEntries(users.map((user) => [user.email, user]));
}

async function clearSeedData(seedUserIds: number[]) {
  const seedFamilyIds = await prisma.family
    .findMany({
      where: {
        OR: [
          { createdBy: { in: seedUserIds } },
          { members: { some: { userId: { in: seedUserIds } } } },
        ],
      },
      select: { id: true },
    })
    .then((families) => families.map((family) => family.id));

  await prisma.friendGroupMember.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { friendGroup: { ownerId: { in: seedUserIds } } },
      ],
    },
  });

  await prisma.friendGroup.deleteMany({
    where: { ownerId: { in: seedUserIds } },
  });

  await prisma.userFriend.deleteMany({
    where: {
      OR: [
        { requesterId: { in: seedUserIds } },
        { addresseeId: { in: seedUserIds } },
      ],
    },
  });

  await prisma.familyFriend.deleteMany({
    where: {
      OR: [
        { requesterFamilyId: { in: seedFamilyIds } },
        { addresseeFamilyId: { in: seedFamilyIds } },
      ],
    },
  });

  await prisma.transaction.deleteMany({
    where: {
      OR: [
        { createdByUserId: { in: seedUserIds } },
        { familyId: { in: seedFamilyIds } },
      ],
    },
  });

  await prisma.transactionCategory.deleteMany({
    where: { familyId: { in: seedFamilyIds } },
  });

  await prisma.familyMember.deleteMany({
    where: {
      OR: [{ userId: { in: seedUserIds } }, { familyId: { in: seedFamilyIds } }],
    },
  });

  await prisma.family.deleteMany({
    where: { id: { in: seedFamilyIds } },
  });
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = await upsertSeedUsers(passwordHash);
  const seedUserIds = Object.values(users).map((user) => user.id);

  await clearSeedData(seedUserIds);

  const testUser = users["test@example.com"];
  const alex = users["alex@example.com"];
  const jamie = users["jamie@example.com"];
  const morgan = users["morgan@example.com"];
  const pat = users["pat@example.com"];

  const wongFamily = await prisma.family.create({
    data: {
      name: "Wong Household",
      createdBy: testUser.id,
      members: {
        create: [
          { userId: testUser.id, memberRole: "OWNER" },
          { userId: alex.id, memberRole: "MEMBER" },
        ],
      },
    },
  });

  const riveraFamily = await prisma.family.create({
    data: {
      name: "Rivera Household",
      createdBy: jamie.id,
      members: {
        create: [{ userId: jamie.id, memberRole: "OWNER" }],
      },
    },
  });

  const chenFamily = await prisma.family.create({
    data: {
      name: "Chen Household",
      createdBy: morgan.id,
      members: {
        create: [{ userId: morgan.id, memberRole: "OWNER" }],
      },
    },
  });

  const patFamily = await prisma.family.create({
    data: {
      name: "Pat's Household",
      createdBy: pat.id,
      members: {
        create: [{ userId: pat.id, memberRole: "OWNER" }],
      },
    },
  });

  const [groceries, dining, income, utilities] = await Promise.all(
    [
      { name: "Groceries", type: "EXPENSE" as const },
      { name: "Dining", type: "EXPENSE" as const },
      { name: "Income", type: "INCOME" as const },
      { name: "Utilities", type: "EXPENSE" as const },
    ].map((category) =>
      prisma.transactionCategory.create({
        data: {
          familyId: wongFamily.id,
          name: category.name,
          type: category.type,
        },
      }),
    ),
  );

  await prisma.transaction.createMany({
    data: [
      {
        familyId: wongFamily.id,
        categoryId: dining.id,
        createdByUserId: testUser.id,
        type: "EXPENSE",
        amountCents: 1299,
        occurredAt: new Date("2026-01-01T12:00:00.000Z"),
        merchant: "Starbucks",
        note: "Coffee",
      },
      {
        familyId: wongFamily.id,
        categoryId: groceries.id,
        createdByUserId: testUser.id,
        type: "EXPENSE",
        amountCents: 4599,
        occurredAt: new Date("2026-01-02T12:00:00.000Z"),
        merchant: "Trader Joe's",
        note: "Groceries",
      },
      {
        familyId: wongFamily.id,
        categoryId: income.id,
        createdByUserId: testUser.id,
        type: "INCOME",
        amountCents: 250000,
        occurredAt: new Date("2026-01-03T12:00:00.000Z"),
        merchant: "Payroll",
        note: "January paycheck",
      },
      {
        familyId: wongFamily.id,
        categoryId: utilities.id,
        createdByUserId: testUser.id,
        type: "EXPENSE",
        amountCents: 8421,
        occurredAt: new Date("2026-01-06T12:00:00.000Z"),
        merchant: "City Utilities",
        note: "Water and power",
      },
    ],
  });

  await prisma.userFriend.createMany({
    data: [
      {
        requesterId: testUser.id,
        addresseeId: jamie.id,
        status: "ACCEPTED",
        acceptedAt: new Date("2026-01-04T12:00:00.000Z"),
      },
      {
        requesterId: alex.id,
        addresseeId: testUser.id,
        status: "ACCEPTED",
        acceptedAt: new Date("2026-01-05T12:00:00.000Z"),
      },
      {
        requesterId: pat.id,
        addresseeId: testUser.id,
        status: "PENDING",
      },
      {
        requesterId: testUser.id,
        addresseeId: morgan.id,
        status: "BLOCKED",
      },
    ],
  });

  await prisma.familyFriend.createMany({
    data: [
      {
        requesterFamilyId: wongFamily.id,
        addresseeFamilyId: riveraFamily.id,
        status: "ACCEPTED",
        acceptedAt: new Date("2026-01-07T12:00:00.000Z"),
      },
      {
        requesterFamilyId: chenFamily.id,
        addresseeFamilyId: wongFamily.id,
        status: "PENDING",
      },
      {
        requesterFamilyId: patFamily.id,
        addresseeFamilyId: riveraFamily.id,
        status: "ACCEPTED",
        acceptedAt: new Date("2026-01-08T12:00:00.000Z"),
      },
    ],
  });

  const closeFriends = await prisma.friendGroup.create({
    data: {
      ownerId: testUser.id,
      name: "Close Friends",
      members: {
        create: [{ userId: alex.id }, { userId: jamie.id }],
      },
    },
  });

  const schoolParents = await prisma.friendGroup.create({
    data: {
      ownerId: testUser.id,
      name: "School Parents",
      members: {
        create: [{ userId: morgan.id }, { userId: pat.id }],
      },
    },
  });

  console.log("Seed complete");
  console.log(`Demo login: test@example.com / ${DEMO_PASSWORD}`);
  console.log(
    `Created ${seedUsers.length} users, 4 families, and 2 friend groups: ${closeFriends.name}, ${schoolParents.name}`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
