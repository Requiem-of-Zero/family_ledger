import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type AllowedContentType = keyof typeof ALLOWED_CONTENT_TYPES;

function getS3Config() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;

  if (!region || !bucket || !publicBaseUrl) {
    throw new HttpError("S3 profile photo storage is not configured", 500);
  }

  return {
    region,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
  };
}

function assertAllowedProfilePhoto(contentType: string, sizeBytes: number) {
  if (!(contentType in ALLOWED_CONTENT_TYPES)) {
    throw new HttpError("Profile photo must be a JPG, PNG, or WEBP image", 400);
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_PROFILE_PHOTO_SIZE) {
    throw new HttpError("Profile photo must be 2MB or smaller", 400);
  }

  return contentType as AllowedContentType;
}

export async function createProfilePhotoUploadUrl({
  userId,
  contentType,
  sizeBytes,
}: {
  userId: number;
  contentType: string;
  sizeBytes: number;
}) {
  const allowedContentType = assertAllowedProfilePhoto(contentType, sizeBytes);
  const { region, bucket, publicBaseUrl } = getS3Config();
  const extension = ALLOWED_CONTENT_TYPES[allowedContentType];
  const key = `profile-photos/${userId}/${crypto.randomUUID()}.${extension}`;
  const client = new S3Client({ region });

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: allowedContentType,
    }),
    { expiresIn: 60 },
  );

  return {
    uploadUrl,
    publicUrl: `${publicBaseUrl}/${key}`,
  };
}

export async function updateProfilePhotoUrl(userId: number, profileImageUrl: string) {
  const { region, bucket, publicBaseUrl } = getS3Config();
  const allowedPrefix = `${publicBaseUrl}/profile-photos/${userId}/`;

  if (!profileImageUrl.startsWith(allowedPrefix)) {
    throw new HttpError("Invalid profile photo URL", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profileImageUrl: true,
    },
  });

  if (!existingUser) {
    throw new HttpError("User not found", 404);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { profileImageUrl },
    select: {
      id: true,
      email: true,
      username: true,
      profileImageUrl: true,
    },
  });

  const oldKey = getOwnedProfilePhotoKey(
    existingUser.profileImageUrl,
    allowedPrefix,
  );

  if (oldKey && oldKey !== getOwnedProfilePhotoKey(profileImageUrl, allowedPrefix)) {
    const client = new S3Client({ region });

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: oldKey,
        }),
      );
    } catch (error) {
      // The DB already points at the new photo. Log cleanup failures so a later
      // maintenance job can retry without blocking the user-facing update.
      console.error("Failed to delete previous profile photo", error);
    }
  }

  return updatedUser;
}

function getOwnedProfilePhotoKey(
  profileImageUrl: string | null,
  allowedPrefix: string,
) {
  if (!profileImageUrl?.startsWith(allowedPrefix)) return null;

  return profileImageUrl.slice(allowedPrefix.indexOf("profile-photos/"));
}
