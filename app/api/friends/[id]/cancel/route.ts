import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { cancelFriendRequest } from "@/src/server/services/friends.service";

const FriendRequestIdSchema = z.coerce.number().int().positive();

// State transition route for the sending user. Canceling removes an outbound
// pending request before the recipient responds.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FriendRequestIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid friend request id", 400, parsedId.error.issues);
    }

    const result = await cancelFriendRequest(user.id, parsedId.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/friends/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
