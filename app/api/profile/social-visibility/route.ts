import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { HttpError } from "@/src/server/services/auth.service";
import {
  getSocialVisibilitySettings,
  updateSocialVisibilitySettings,
} from "@/src/server/services/social-visibility.service";

const UpdateSocialVisibilitySchema = z.object({
  showFriendsOnProfile: z.boolean().optional(),
  showFriendGroupsOnProfile: z.boolean().optional(),
  showFamiliesOnProfile: z.boolean().optional(),
  showFamilyFriendsOnProfile: z.boolean().optional(),
});

// Profile setting route: read the current user's saved social visibility.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const socialVisibility = await getSocialVisibilitySettings(user.id);

    return NextResponse.json({ socialVisibility }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("GET /api/profile/social-visibility error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Profile setting route: persist one or both social visibility switches.
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const body = UpdateSocialVisibilitySchema.safeParse(
      await req.json().catch(() => ({})),
    );

    if (!body.success) {
      throw new HttpError("Invalid social visibility settings", 400, body.error.issues);
    }

    const socialVisibility = await updateSocialVisibilitySettings(
      user.id,
      body.data,
    );

    return NextResponse.json({ socialVisibility }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("PATCH /api/profile/social-visibility error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
