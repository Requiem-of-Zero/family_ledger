import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { updateProfilePhotoUrl } from "@/src/server/services/profile-photo.service";

const UpdateProfilePhotoSchema = z.object({
  profileImageUrl: z.string().url(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = UpdateProfilePhotoSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid profile photo", 400, body.error.issues);
    }

    const updatedUser = await updateProfilePhotoUrl(
      user.id,
      body.data.profileImageUrl,
    );

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/profile/photo error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
