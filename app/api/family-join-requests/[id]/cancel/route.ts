import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { cancelFamilyJoinRequest } from "@/src/server/services/families.service";

const FamilyJoinRequestIdSchema = z.coerce.number().int().positive();

// State transition route: requester or family owner cancels a pending invite.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FamilyJoinRequestIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid family join request id", 400, parsedId.error.issues);
    }

    const familyJoinRequest = await cancelFamilyJoinRequest(user.id, parsedId.data);

    return NextResponse.json({ familyJoinRequest }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/family-join-requests/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
