import { z } from "zod";

// Register payload shape
export const RegisterSchema = z.object({
  email: z.email(),
  username: z.string().min(5).max(50),
  password: z.string().min(8).max(200),
  // Optional: create a family at registration
  familyName: z.string().min(1).max(80).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>; //z.infer provides a TS type directly from schema

// Login payload shape
export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;
