import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  removeFamilyMember,
  updateFamilyMemberSettings,
} from "@/src/server/services/families.service";

const FamilyIdSchema = z.coerce.number().int().positive();
const FamilyMemberIdSchema = z.coerce.number().int().positive();
const UpdateFamilyMemberSchema = z
  .object({
    memberRole: z.enum(["CO_OWNER", "MEMBER"]).optional(),
    relationshipLabel: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .nullable()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Request body cannot be empty",
  });

// Member route: owner updates a non-owner member's role and/or family label.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id, memberId } = await params;
    const parsedFamilyId = FamilyIdSchema.safeParse(id);
    const parsedMemberId = FamilyMemberIdSchema.safeParse(memberId);

    if (!parsedFamilyId.success) {
      throw new HttpError("Invalid family id", 400, parsedFamilyId.error.issues);
    }

    if (!parsedMemberId.success) {
      throw new HttpError("Invalid family member id", 400, parsedMemberId.error.issues);
    }

    const body = UpdateFamilyMemberSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid family member update", 400, body.error.issues);
    }

    const member = await updateFamilyMemberSettings(
      user.id,
      parsedFamilyId.data,
      parsedMemberId.data,
      body.data,
    );

    return NextResponse.json({ member }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("PATCH /api/families/[id]/members/[memberId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Member route: owner soft-removes a member from the family. The FamilyMember
// row remains for history, but isActive=false means it no longer grants access.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id, memberId } = await params;
    const parsedFamilyId = FamilyIdSchema.safeParse(id);
    const parsedMemberId = FamilyMemberIdSchema.safeParse(memberId);

    if (!parsedFamilyId.success) {
      throw new HttpError("Invalid family id", 400, parsedFamilyId.error.issues);
    }

    if (!parsedMemberId.success) {
      throw new HttpError("Invalid family member id", 400, parsedMemberId.error.issues);
    }

    const member = await removeFamilyMember(
      user.id,
      parsedFamilyId.data,
      parsedMemberId.data,
    );

    return NextResponse.json({ member }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("DELETE /api/families/[id]/members/[memberId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
