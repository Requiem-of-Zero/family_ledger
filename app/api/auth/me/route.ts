import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";

export async function GET(req: Request) {
  const user = await getCurrentUserFromRequest(req);

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    },
    { status: 200 },
  );
}
