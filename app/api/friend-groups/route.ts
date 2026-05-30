import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { listFriendGroupsForUser } from "@/src/server/services/friend-groups.service";

// Collection route: expose groups the current user can target in sharing profiles.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const friendGroups = await listFriendGroupsForUser(user.id);

    return NextResponse.json({ friendGroups }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("GET /api/friend-groups error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
