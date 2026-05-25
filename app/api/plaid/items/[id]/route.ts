import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { disconnectPlaidItemForUser } from "@/src/server/services/plaid.service";

const PlaidItemIdSchema = z.coerce.number().int().positive();
const DisconnectBodySchema = z.object({
  deleteImportedTransactions: z.boolean().optional(),
});

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsedId = PlaidItemIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid Plaid item id", details: parsedId.error.issues },
      { status: 400 },
    );
  }

  try {
    const body = DisconnectBodySchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid disconnect request", details: body.error.issues },
        { status: 400 },
      );
    }

    const result = await disconnectPlaidItemForUser(user.id, parsedId.data, {
      deleteImportedTransactions: body.data.deleteImportedTransactions,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Plaid connection not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("PLAID item disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Plaid connection" },
      { status: 500 },
    );
  }
}
