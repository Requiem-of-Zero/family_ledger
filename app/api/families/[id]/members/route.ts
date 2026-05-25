import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { addFamilyMemberByEmail } from "@/src/server/services/families.service";

const FamilyIdSchema = z.coerce.number().int().positive();
const AddFamilyMemberSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

// Family membership route: add/reactivate a user by email. Owner-only for now.
export async function POST(
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

    const body = AddFamilyMemberSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid family member request", 400, body.error.issues);
    }

    const member = await addFamilyMemberByEmail(
      user.id,
      parsedId.data,
      body.data.email,
    );

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/families/[id]/members error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
