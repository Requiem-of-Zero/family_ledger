import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { listPlaidAccountsForUser } from "@/src/server/services/plaid.service";

export async function GET(req: Request) {
  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await listPlaidAccountsForUser(user.id);

    return NextResponse.json({ accounts }, { status: 200 });
  } catch (error) {
    console.error("PLAID accounts list error:", error);
    return NextResponse.json(
      { error: "Failed to load Plaid accounts" },
      { status: 500 },
    );
  }
}
