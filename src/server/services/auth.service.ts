import { prisma } from "../db/prisma";
import {
  RegisterSchema,
  LoginSchema,
  type RegisterInput,
  type LoginInput,
} from "../../shared/validators/auth";
import { hashPassword, verifyPassword } from "../auth/password";
import {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiryDate,
} from "../auth/session";

// A small error helper for clean test assertions
export class HttpError extends Error {
  public status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// What the service returns on login/register
export type AuthResult = {
  user: {
    id: number;
    email: string;
    username: string;
    role: string;
  };
  sessionToken: string; // Session token goes into cookie
};

export async function register(input: RegisterInput): Promise<AuthResult> {
  const data = RegisterSchema.parse(input); // Validates and returns typed data

  const existing = await prisma.user.findUnique({
    // Check db of users for uniqueness
    where: { email: data.email },
  });

  if (existing) throw new HttpError("Email already in use", 409);

  const passwordHash = await hashPassword(data.password);

  // Create user + family + membership in a single transaction
  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiryDate();

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
      },
    });

    const family = await tx.family.create({
      data: {
        name: data.familyName ?? `${data.username}'s Family`,
        createdBy: user.id,
      },
    });

    await tx.familyMember.create({
      data: {
        familyId: family.id,
        userId: user.id,
        memberRole: "OWNER",
      },
    });

    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return { user };
  });

  return {
    user: {
      id: created.user.id,
      email: created.user.email,
      username: created.user.username,
      role: created.user.role,
    },
    sessionToken,
  };
}

// Login: verifies password and creates a new session
export async function login(input: LoginInput): Promise<AuthResult> {
  const data = LoginSchema.parse(input);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new HttpError("No user found. Try a different login.", 401);

  if (!user.isActive) throw new HttpError("Account disabled", 403);

  const ok = await verifyPassword(user.passwordHash, data.password);
  if (!ok) throw new HttpError("Invalid email or password", 401);

  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiryDate();

  await prisma.$transaction(async (tx) => {
    await tx.session.create({
      // Create the session with the user from credentials passed in
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLogin: new Date(),
      },
    });
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    sessionToken,
  };
}
