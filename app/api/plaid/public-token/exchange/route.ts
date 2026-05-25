import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { exchangePublicTokenForUser } from "@/src/server/services/plaid.service";

const ExchangeBodySchema = z.object({
  publicToken: z.string().min(1),
  metadata: z
    .object({
      institution: z
        .object({
          institution_id: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ExchangeBodySchema.safeParse(await req.json().catch(() => ({})));

  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid Plaid exchange request" },
      { status: 400 },
    );
  }

  try {
    // This stores the Plaid item and accounts for the logged-in user.
    const result = await exchangePublicTokenForUser(
      user.id,
      body.data.publicToken,
      body.data.metadata,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("PLAID public token exchange error:", error);
    return NextResponse.json(
      { error: "Failed to exchange Plaid public token" },
      { status: 500 },
    );
  }
}
