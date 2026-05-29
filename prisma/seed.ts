import { hashPassword } from "@/src/server/auth/password";
import { prisma } from "@/src/server/db/prisma";

const DEMO_PASSWORD = "password123";

const seedUsers = [
  { email: "test@example.com", username: "testuser" },
  { email: "alex@example.com", username: "alex" },
  { email: "jamie@example.com", username: "jamie" },
  { email: "morgan@example.com", username: "morgan" },
  { email: "pat@example.com", username: "pat" },
  { email: "riley@example.com", username: "riley" },
  { email: "casey@example.com", username: "casey" },
  { email: "taylor@example.com", username: "taylor" },
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

  await prisma.familyJoinRequest.deleteMany({
    where: {
      OR: [
        { requesterId: { in: seedUserIds } },
        { addresseeId: { in: seedUserIds } },
        { familyId: { in: seedFamilyIds } },
      ],
    },
  });

  await prisma.transactionShare.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { familyId: { in: seedFamilyIds } },
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

  await prisma.sharingProfileTarget.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { familyId: { in: seedFamilyIds } },
      ],
    },
  });

  await prisma.sharingProfile.deleteMany({
    where: { userId: { in: seedUserIds } },
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
  const riley = users["riley@example.com"];
  const casey = users["casey@example.com"];
  const taylor = users["taylor@example.com"];

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

  const rileyFamily = await prisma.family.create({
    data: {
      name: "Riley Household",
      createdBy: riley.id,
      members: {
        create: [{ userId: riley.id, memberRole: "OWNER" }],
      },
    },
  });

  const caseyFamily = await prisma.family.create({
    data: {
      name: "Casey's Household",
      createdBy: casey.id,
      members: {
        create: [{ userId: casey.id, memberRole: "OWNER" }],
      },
    },
  });

  const [groceries, dining, income, utilities, housing, transport, childcare, subscriptions, health, shopping] = await Promise.all(
    [
      { name: "Groceries", type: "EXPENSE" as const },
      { name: "Dining", type: "EXPENSE" as const },
      { name: "Income", type: "INCOME" as const },
      { name: "Utilities", type: "EXPENSE" as const },
      { name: "Housing", type: "EXPENSE" as const },
      { name: "Transportation", type: "EXPENSE" as const },
      { name: "Childcare", type: "EXPENSE" as const },
      { name: "Subscriptions", type: "EXPENSE" as const },
      { name: "Health", type: "EXPENSE" as const },
      { name: "Shopping", type: "EXPENSE" as const },
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

  const transactionSeedData = [
    ["2026-01-01", "EXPENSE", 1299, "Starbucks", "Coffee", dining.id],
    ["2026-01-02", "EXPENSE", 4599, "Trader Joe's", "Groceries", groceries.id],
    ["2026-01-03", "INCOME", 250000, "Payroll", "January paycheck", income.id],
    ["2026-01-04", "EXPENSE", 18750, "Progressive", "Auto insurance", transport.id],
    ["2026-01-05", "EXPENSE", 185000, "Rent", "January rent", housing.id],
    ["2026-01-06", "EXPENSE", 8421, "City Utilities", "Water and power", utilities.id],
    ["2026-01-08", "EXPENSE", 3299, "Target", "Household supplies", shopping.id],
    ["2026-01-10", "EXPENSE", 1540, "Netflix", "Family streaming", subscriptions.id],
    ["2026-01-12", "EXPENSE", 7250, "Kroger", "Weekly groceries", groceries.id],
    ["2026-01-14", "EXPENSE", 4218, "Shell", "Gas", transport.id],
    ["2026-01-15", "INCOME", 250000, "Payroll", "Mid-month paycheck", income.id],
    ["2026-01-16", "EXPENSE", 2865, "Chipotle", "Dinner", dining.id],
    ["2026-01-18", "EXPENSE", 42000, "Little Oaks Daycare", "Childcare", childcare.id],
    ["2026-01-20", "EXPENSE", 9650, "PGE", "Electric bill", utilities.id],
    ["2026-01-22", "EXPENSE", 6825, "Costco", "Bulk groceries", groceries.id],
    ["2026-01-24", "EXPENSE", 2299, "Spotify", "Music plan", subscriptions.id],
    ["2026-01-26", "EXPENSE", 5500, "Walgreens", "Medicine", health.id],
    ["2026-01-28", "EXPENSE", 3199, "Amazon", "School supplies", shopping.id],
    ["2026-01-30", "EXPENSE", 1842, "Blue Bottle", "Coffee meeting", dining.id],
    ["2026-02-01", "INCOME", 250000, "Payroll", "February paycheck", income.id],
    ["2026-02-02", "EXPENSE", 185000, "Rent", "February rent", housing.id],
    ["2026-02-03", "EXPENSE", 8044, "Whole Foods", "Groceries", groceries.id],
    ["2026-02-05", "EXPENSE", 4776, "Chevron", "Gas", transport.id],
    ["2026-02-07", "EXPENSE", 3321, "Pho House", "Family dinner", dining.id],
    ["2026-02-09", "EXPENSE", 8999, "City Utilities", "Water and power", utilities.id],
    ["2026-02-11", "EXPENSE", 42000, "Little Oaks Daycare", "Childcare", childcare.id],
    ["2026-02-13", "EXPENSE", 1499, "iCloud", "Storage", subscriptions.id],
    ["2026-02-15", "INCOME", 250000, "Payroll", "Mid-month paycheck", income.id],
    ["2026-02-16", "EXPENSE", 7640, "Trader Joe's", "Groceries", groceries.id],
    ["2026-02-18", "EXPENSE", 12350, "Dental Clinic", "Cleaning", health.id],
    ["2026-02-20", "EXPENSE", 5299, "Uniqlo", "Clothes", shopping.id],
    ["2026-02-22", "EXPENSE", 2844, "In-N-Out", "Lunch", dining.id],
    ["2026-02-24", "EXPENSE", 4120, "Shell", "Gas", transport.id],
    ["2026-02-26", "EXPENSE", 6944, "Safeway", "Groceries", groceries.id],
    ["2026-02-28", "EXPENSE", 2299, "Spotify", "Music plan", subscriptions.id],
    ["2026-03-01", "INCOME", 250000, "Payroll", "March paycheck", income.id],
    ["2026-03-02", "EXPENSE", 185000, "Rent", "March rent", housing.id],
    ["2026-03-04", "EXPENSE", 7222, "Costco", "Groceries", groceries.id],
    ["2026-03-06", "EXPENSE", 9690, "PGE", "Electric bill", utilities.id],
    ["2026-03-08", "EXPENSE", 4300, "Exxon", "Gas", transport.id],
    ["2026-03-10", "EXPENSE", 3650, "Ramen Nagi", "Dinner", dining.id],
    ["2026-03-12", "EXPENSE", 42000, "Little Oaks Daycare", "Childcare", childcare.id],
    ["2026-03-14", "EXPENSE", 1599, "Hulu", "Streaming", subscriptions.id],
    ["2026-03-15", "INCOME", 250000, "Payroll", "Mid-month paycheck", income.id],
    ["2026-03-17", "EXPENSE", 8855, "Whole Foods", "Groceries", groceries.id],
    ["2026-03-19", "EXPENSE", 4800, "CVS", "Health supplies", health.id],
    ["2026-03-21", "EXPENSE", 6100, "Target", "Home goods", shopping.id],
    ["2026-03-23", "EXPENSE", 5105, "Shell", "Gas", transport.id],
    ["2026-03-25", "EXPENSE", 2950, "Cafe Luna", "Brunch", dining.id],
    ["2026-03-27", "EXPENSE", 7420, "Trader Joe's", "Groceries", groceries.id],
    ["2026-03-29", "EXPENSE", 2299, "Spotify", "Music plan", subscriptions.id],
  ] as const;

  await prisma.transaction.createMany({
    data: transactionSeedData.map(
      ([date, type, amountCents, merchant, note, categoryId]) => ({
        familyId: wongFamily.id,
        categoryId,
        createdByUserId: testUser.id,
        type,
        amountCents,
        occurredAt: new Date(`${date}T12:00:00.000Z`),
        merchant,
        note,
      }),
    ),
  });

  await prisma.transaction.createMany({
    data: [
      {
        familyId: null,
        categoryId: null,
        createdByUserId: testUser.id,
        type: "EXPENSE",
        amountCents: 1999,
        occurredAt: new Date("2026-03-30T12:00:00.000Z"),
        merchant: "Personal Books",
        note: "Personal-only transaction",
      },
      {
        familyId: null,
        categoryId: null,
        createdByUserId: testUser.id,
        type: "INCOME",
        amountCents: 7500,
        occurredAt: new Date("2026-03-31T12:00:00.000Z"),
        merchant: "Marketplace",
        note: "Sold old monitor",
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
        requesterId: riley.id,
        addresseeId: testUser.id,
        status: "PENDING",
      },
      {
        requesterId: testUser.id,
        addresseeId: casey.id,
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
        requesterFamilyId: wongFamily.id,
        addresseeFamilyId: caseyFamily.id,
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

  await prisma.familyJoinRequest.createMany({
    data: [
      {
        familyId: wongFamily.id,
        requesterId: testUser.id,
        addresseeId: morgan.id,
        status: "PENDING",
      },
      {
        familyId: wongFamily.id,
        requesterId: testUser.id,
        addresseeId: pat.id,
        status: "REJECTED",
      },
      {
        familyId: wongFamily.id,
        requesterId: testUser.id,
        addresseeId: taylor.id,
        status: "CANCELED",
      },
      {
        familyId: rileyFamily.id,
        requesterId: riley.id,
        addresseeId: testUser.id,
        status: "PENDING",
      },
      {
        familyId: patFamily.id,
        requesterId: pat.id,
        addresseeId: testUser.id,
        status: "PENDING",
      },
      {
        familyId: caseyFamily.id,
        requesterId: casey.id,
        addresseeId: testUser.id,
        status: "ACCEPTED",
        acceptedAt: new Date("2026-03-20T12:00:00.000Z"),
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

  const householdSharingProfile = await prisma.sharingProfile.create({
    data: {
      userId: testUser.id,
      name: "Household",
      resourceType: "TRANSACTION",
      isDefault: true,
      targets: {
        create: [{ targetType: "FAMILY", familyId: wongFamily.id }],
      },
    },
  });

  const closeFriendsSharingProfile = await prisma.sharingProfile.create({
    data: {
      userId: testUser.id,
      name: "Close Friends",
      resourceType: "TRANSACTION",
      isDefault: false,
      targets: {
        create: [
          { targetType: "USER", userId: jamie.id },
          { targetType: "FRIEND_GROUP", friendGroupId: closeFriends.id },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      createdByUserId: testUser.id,
      familyId: wongFamily.id,
      sharingProfileId: householdSharingProfile.id,
      visibility: "FAMILY",
      categoryId: groceries.id,
      type: "EXPENSE",
      amountCents: 11842,
      occurredAt: new Date("2026-05-24T12:00:00.000Z"),
      merchant: "H Mart",
      note: "Seeded household shared groceries",
      shares: {
        create: [{ targetType: "FAMILY", familyId: wongFamily.id }],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      createdByUserId: testUser.id,
      friendGroupId: closeFriends.id,
      sharingProfileId: closeFriendsSharingProfile.id,
      visibility: "CUSTOM",
      categoryId: dining.id,
      type: "EXPENSE",
      amountCents: 4860,
      occurredAt: new Date("2026-05-26T12:00:00.000Z"),
      merchant: "Pizza Night",
      note: "Seeded mixed share to friend group and Jamie",
      shares: {
        create: [
          { targetType: "USER", userId: jamie.id },
          { targetType: "FRIEND_GROUP", friendGroupId: closeFriends.id },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      createdByUserId: jamie.id,
      familyId: wongFamily.id,
      visibility: "FAMILY",
      categoryId: groceries.id,
      type: "EXPENSE",
      amountCents: 6240,
      occurredAt: new Date("2026-05-27T12:00:00.000Z"),
      merchant: "Shared Costco Run",
      note: "Seeded family share from Jamie",
      shares: {
        create: [{ targetType: "FAMILY", familyId: wongFamily.id }],
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
