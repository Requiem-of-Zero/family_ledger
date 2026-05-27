import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  listFamilyJoinRequestsForUser,
  sendFamilyJoinRequest,
} from "@/src/server/services/families.service";

const SendFamilyJoinRequestSchema = z.object({
  familyId: z.coerce.number().int().positive(),
  addresseeEmail: z.string().trim().email().toLowerCase(),
});

// Collection route: show invitations relevant to the current user. Invited
// users see received requests; family owners also see outgoing family invites.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const familyJoinRequests = await listFamilyJoinRequestsForUser(user.id);

    return NextResponse.json({ familyJoinRequests }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("GET /api/family-join-requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Collection route: send an invitation to join a family by email. Owner-only;
// accepting the invite later is what creates the FamilyMember row.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = SendFamilyJoinRequestSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid family join request", 400, body.error.issues);
    }

    const familyJoinRequest = await sendFamilyJoinRequest(
      user.id,
      body.data.familyId,
      body.data.addresseeEmail,
    );

    return NextResponse.json({ familyJoinRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/family-join-requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
