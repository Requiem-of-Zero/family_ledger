import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { syncPlaidTransactionsForUser } from "@/src/server/services/plaid.service";

export async function POST(req: Request) {
  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Pull Plaid transaction changes for every bank connection owned by this
    // user, then upsert them into the app's normal Transaction table.
    const result = await syncPlaidTransactionsForUser(user.id);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("PLAID transaction sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync Plaid transactions" },
      { status: 500 },
    );
  }
}
