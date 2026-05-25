import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { rejectFamilyFriendRequest } from "@/src/server/services/families.service";

const FamilyFriendIdSchema = z.coerce.number().int().positive();

// State transition route for the receiving family. Rejecting deletes the pending
// family-friend row.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FamilyFriendIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid family friend id", 400, parsedId.error.issues);
    }

    const result = await rejectFamilyFriendRequest(user.id, parsedId.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/family-friends/[id]/reject error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
