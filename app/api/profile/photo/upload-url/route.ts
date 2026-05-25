import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import { createProfilePhotoUploadUrl } from "@/src/server/services/profile-photo.service";

const ProfilePhotoUploadUrlSchema = z.object({
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = ProfilePhotoUploadUrlSchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid profile photo upload", 400, body.error.issues);
    }

    const upload = await createProfilePhotoUploadUrl({
      userId: user.id,
      contentType: body.data.contentType,
      sizeBytes: body.data.sizeBytes,
    });

    return NextResponse.json(upload, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/profile/photo/upload-url error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
