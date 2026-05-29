import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  createSharingProfileForUser,
  listSharingProfilesForUser,
} from "@/src/server/services/sharing-profiles.service";

const ShareTargetSchema = z.object({
  targetType: z.enum(["FAMILY", "FRIEND_GROUP", "USER"]),
  familyId: z.coerce.number().int().positive().optional(),
  friendGroupId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const CreateSharingProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  resourceType: z.enum(["TRANSACTION", "RECIPE", "ALL"]).default("TRANSACTION"),
  isDefault: z.boolean().default(false),
  targets: z.array(ShareTargetSchema).min(1),
});

// Collection route: list saved share presets owned by the current user.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const sharingProfiles = await listSharingProfilesForUser(user.id);

    return NextResponse.json({ sharingProfiles }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("GET /api/sharing-profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Collection route: create a reusable share preset for transactions/recipes.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = CreateSharingProfileSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid sharing profile request", 400, body.error.issues);
    }

    const sharingProfile = await createSharingProfileForUser(user.id, body.data);

    return NextResponse.json({ sharingProfile }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/sharing-profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
