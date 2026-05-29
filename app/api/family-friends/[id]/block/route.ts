import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { blockFamilyFriendRelationship } from "@/src/server/services/families.service";

const FamilyFriendIdSchema = z.coerce.number().int().positive();

// State transition route: either family owner can block the relationship.
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

    const familyFriend = await blockFamilyFriendRelationship(
      user.id,
      parsedId.data,
    );

    return NextResponse.json({ familyFriend }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/family-friends/[id]/block error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
