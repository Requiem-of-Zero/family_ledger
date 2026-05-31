import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

export type SocialVisibilityInput = {
  showFriendsOnProfile?: boolean;
  showFriendGroupsOnProfile?: boolean;
};

export async function getSocialVisibilitySettings(userId: number) {
  const settings = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      showFriendsOnProfile: true,
      showFriendGroupsOnProfile: true,
    },
  });

  if (!settings) {
    throw new HttpError("User not found", 404);
  }

  return settings;
}

export async function updateSocialVisibilitySettings(
  userId: number,
  input: SocialVisibilityInput,
) {
  // Only write the keys the client intentionally changed. That lets one toggle
  // update without accidentally resetting the other visibility preference.
  const data: SocialVisibilityInput = {};

  if (typeof input.showFriendsOnProfile === "boolean") {
    data.showFriendsOnProfile = input.showFriendsOnProfile;
  }

  if (typeof input.showFriendGroupsOnProfile === "boolean") {
    data.showFriendGroupsOnProfile = input.showFriendGroupsOnProfile;
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError("No visibility settings provided", 400);
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      showFriendsOnProfile: true,
      showFriendGroupsOnProfile: true,
    },
  });
}
