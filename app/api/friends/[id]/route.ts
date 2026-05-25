import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { removeFriendRelationship } from "@/src/server/services/friends.service";

const FriendRelationshipIdSchema = z.coerce.number().int().positive();

// Relationship route: remove an existing friend relationship. Either participant
// can remove the row.
export async function DELETE(
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

    const result = await removeFriendRelationship(user.id, parsedId.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("DELETE /api/friends/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
