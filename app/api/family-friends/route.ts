import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  listFamilyFriendRelationshipsForUser,
  sendFamilyFriendRequest,
} from "@/src/server/services/families.service";

const SendFamilyFriendRequestSchema = z.object({
  requesterFamilyId: z.coerce.number().int().positive(),
  addresseeFamilyId: z.coerce.number().int().positive(),
});

// Collection route: list family-friend rows for every family the user belongs to.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const familyFriends = await listFamilyFriendRelationshipsForUser(user.id);

    return NextResponse.json({ familyFriends }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("GET /api/family-friends error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Collection route: create a pending family-to-family friend request.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = SendFamilyFriendRequestSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid family friend request", 400, body.error.issues);
    }

    const familyFriend = await sendFamilyFriendRequest(
      user.id,
      body.data.requesterFamilyId,
      body.data.addresseeFamilyId,
    );

    return NextResponse.json({ familyFriend }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/family-friends error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
