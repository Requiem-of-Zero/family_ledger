import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { createPlaidLinkTokenForUser } from "@/src/server/services/plaid.service";

export async function POST(req: Request) {
  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // The frontend needs this token to open Plaid's prebuilt Link UI.
    const linkToken = await createPlaidLinkTokenForUser(user);

    return NextResponse.json({ linkToken }, { status: 200 });
  } catch (error) {
    console.error("PLAID link token error:", error);
    return NextResponse.json(
      { error: "Failed to create Plaid link token" },
      { status: 500 },
    );
  }
}
