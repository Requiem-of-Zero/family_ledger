import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { blockFriendRelationship } from "@/src/server/services/friends.service";

const FriendRelationshipIdSchema = z.coerce.number().int().positive();

// State transition route: any participant can block an existing relationship.
// The service stores BLOCKED instead of deleting so future requests stay denied.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FriendRelationshipIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid friend relationship id", 400, parsedId.error.issues);
    }

    const friendRelationship = await blockFriendRelationship(user.id, parsedId.data);

    return NextResponse.json({ friendRelationship }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/friends/[id]/block error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
