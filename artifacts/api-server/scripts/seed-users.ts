import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

const resolvedDatabaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;

if (!process.env.DATABASE_URL && resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL or DATABASE_URL_TEST must be set before seeding users");
}

const [{ db }, { usersTable }] = await Promise.all([
  import("@workspace/db"),
  import("@workspace/db/schema"),
]);

const DEFAULT_USERS = [
  {
    username: "operator1",
    password: "Operator@123",
    role: "operator",
    displayName: "Operator 1",
  },
  {
    username: "operator2",
    password: "Operator@123",
    role: "operator",
    displayName: "Operator 2",
  },
  {
    username: "qa1",
    password: "QA@123456",
    role: "qa",
    displayName: "QA Engineer 1",
  },
  {
    username: "engineer1",
    password: "Engineer@123",
    role: "engineer",
    displayName: "Engineer 1",
  },
] as const;

async function seedUsers() {
  console.log("Seeding default users...");

  for (const user of DEFAULT_USERS) {
    const existing = await db.query.usersTable.findFirst({
      where: and(eq(usersTable.username, user.username), eq(usersTable.role, user.role)),
    });

    if (existing) {
      console.log(`  SKIP: ${user.username} already exists`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 12);

    await db.insert(usersTable).values({
      username: user.username,
      password: hashedPassword,
      role: user.role,
      displayName: user.displayName,
      name: user.displayName,
    });

    console.log(`  CREATED: ${user.username} (${user.role})`);
  }

  console.log("Done. Users seeded successfully.");
  process.exit(0);
}

seedUsers().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
