import argon2 from "argon2";

// Hash a plaintext password
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword);
}

// Verify a plaintext password against a stored hash
export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  return argon2.verify(passwordHash, plainPassword);
}
