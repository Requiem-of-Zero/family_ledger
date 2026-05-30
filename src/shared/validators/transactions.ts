import { z } from "zod";

// -------------- Zod Schemas --------------

export const TransactionTypeSchema = z.enum(["EXPENSE", "INCOME"]);
export const TransactionVisibilitySchema = z.enum([
  "PERSONAL",
  "FAMILY",
  "FRIEND_GROUP",
  "SPECIFIC_USERS",
  "CUSTOM",
]);

// A generic share target lets one transaction/profile point at families, friend
// groups, specific users, or a mix of those targets.
export const ShareTargetSchema = z.object({
  targetType: z.enum(["FAMILY", "FRIEND_GROUP", "USER"]),
  familyId: z.coerce.number().int().positive().optional(),
  friendGroupId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

export const TransactionShareSchema = z.object({
  id: z.number().int().positive(),
  targetType: z.enum(["FAMILY", "FRIEND_GROUP", "USER"]),
  familyId: z.number().int().positive().nullable().optional(),
  friendGroupId: z.number().int().positive().nullable().optional(),
  userId: z.number().int().positive().nullable().optional(),
});

export const TransactionIdSchema = z.coerce
  .number()
  .int("Transaction id must be an integer")
  .positive("Transaction id must be > 0");

export const TransactionSchema = z.object({
  id: TransactionIdSchema,
  createdByUserId: z.number().int().positive(),
  type: TransactionTypeSchema,
  amountCents: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  visibility: TransactionVisibilitySchema.default("PERSONAL"),
  sharingProfileId: z.coerce.number().int().positive().nullable().optional(),
  familyId: z.coerce.number().int().positive().nullable().optional(),
  friendGroupId: z.coerce.number().int().positive().nullable().optional(),
  shareTargets: z.array(ShareTargetSchema).optional(),
  sharedUserIds: z.array(z.coerce.number().int().positive()).optional(),
  shares: z.array(TransactionShareSchema).default([]),
  sharingProfile: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  plaidAccountId: z.coerce.number().int().positive().nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  plaidAccount: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      mask: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      subtype: z.string().nullable().optional(),
      item: z.object({
        id: z.number().int().positive(),
        institutionName: z.string().nullable().optional(),
      }),
    })
    .nullable()
    .optional(),
});

export const CreateTransactionSchema = z.object({
  type: TransactionTypeSchema,
  amountCents: z
    .number()
    .int("amountCents must be an integer")
    .positive("amountCents must be > 0"),
  occurredAt: z.coerce.date(),
  visibility: TransactionVisibilitySchema.optional(),
  sharingProfileId: z.coerce.number().int().positive().optional(),
  familyId: z.coerce.number().int().positive().optional(),
  friendGroupId: z.coerce.number().int().positive().optional(),
  shareTargets: z.array(ShareTargetSchema).optional(),
  sharedUserIds: z.array(z.coerce.number().int().positive()).optional(),
  categoryId: z.coerce.number().int().positive().optional(),

  merchant: z
    .string()
    .trim()
    .min(1, "Merchant cannot be empty")
    .max(120)
    .optional(),
  note: z.string().trim().min(1, "Note cannot be empty").max(500).optional(),
});

export const ListTransactionSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    familyId: z.coerce.number().int().positive().optional(),
    type: TransactionTypeSchema.optional(),
  })
  .refine((obj) => !obj.from || !obj.to || obj.from <= obj.to, {
    message: "`from` must be <= `to`",
    path: ["from"],
  });

export const TransactionListResponseSchema = z.object({
  transactions: z.array(TransactionSchema),
});

export const UpdateTransactionSchema = CreateTransactionSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  {
    message: "Request body cannot be empty",
  },
);

// -------------- Inferred Zod types --------------

export type Transaction = z.infer<typeof TransactionSchema>;

export type TransactionId = z.infer<typeof TransactionIdSchema>;

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export type ListTransactionQuery = z.infer<typeof ListTransactionSchema>;

export type TransactionListResponse = z.infer<
  typeof TransactionListResponseSchema
>;

export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type TransactionVisibility = z.infer<typeof TransactionVisibilitySchema>;

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
