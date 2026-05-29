import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  deleteSharingProfileForUser,
  updateSharingProfileForUser,
} from "@/src/server/services/sharing-profiles.service";

const SharingProfileIdSchema = z.coerce.number().int().positive();
const ShareTargetSchema = z.object({
  targetType: z.enum(["FAMILY", "FRIEND_GROUP", "USER"]),
  familyId: z.coerce.number().int().positive().optional(),
  friendGroupId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});
const UpdateSharingProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    resourceType: z.enum(["TRANSACTION", "RECIPE", "ALL"]).optional(),
    isDefault: z.boolean().optional(),
    targets: z.array(ShareTargetSchema).min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Request body cannot be empty",
  });

// Sharing profile item route: update name/default flag/targets for a preset.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = SharingProfileIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid sharing profile id", 400, parsedId.error.issues);
    }

    const body = UpdateSharingProfileSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid sharing profile update", 400, body.error.issues);
    }

    const sharingProfile = await updateSharingProfileForUser(
      user.id,
      parsedId.data,
      body.data,
    );

    return NextResponse.json({ sharingProfile }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("PATCH /api/sharing-profiles/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Sharing profile item route: remove a saved preset without touching old rows.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = SharingProfileIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid sharing profile id", 400, parsedId.error.issues);
    }

    const result = await deleteSharingProfileForUser(user.id, parsedId.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("DELETE /api/sharing-profiles/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
