import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  deleteFamilyForOwner,
  updateFamilyName,
} from "@/src/server/services/families.service";

const FamilyIdSchema = z.coerce.number().int().positive();
const UpdateFamilySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// Family item route: owner-only rename for family profile settings.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FamilyIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid family id", 400, parsedId.error.issues);
    }

    const body = UpdateFamilySchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid family update request", 400, body.error.issues);
    }

    const family = await updateFamilyName(
      user.id,
      parsedId.data,
      body.data.name,
    );

    return NextResponse.json({ family }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("PATCH /api/families/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Family item route: owner-only soft delete. Memberships are deactivated in the
// service so the family disappears from normal user-scoped queries immediately.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;
    const parsedId = FamilyIdSchema.safeParse(id);

    if (!parsedId.success) {
      throw new HttpError("Invalid family id", 400, parsedId.error.issues);
    }

    const family = await deleteFamilyForOwner(user.id, parsedId.data);

    return NextResponse.json({ family }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("DELETE /api/families/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
