"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useState, useTransition } from "react";

const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePhotoUploader({
  imageUrl,
  username,
  email,
}: {
  imageUrl: string | null;
  username: string;
  email: string;
}) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState(imageUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const initials = getInitials(username || email);
  const busy = isUploading || isPending;

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setMessage(null);

    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      setMessage("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      setMessage("Choose an image that is 2MB or smaller.");
      return;
    }

    setIsUploading(true);

    try {
      const uploadRes = await fetch("/api/profile/photo/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const upload = await readJsonOrThrow<{
        uploadUrl: string;
        publicUrl: string;
      }>(uploadRes);

      const s3Res = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });

      if (!s3Res.ok) {
        throw new Error("Failed to upload profile photo.");
      }

      const saveRes = await fetch("/api/profile/photo", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileImageUrl: upload.publicUrl }),
      });
      await readJsonOrThrow(saveRes);

      setPreviewUrl(upload.publicUrl);
      setMessage("Profile photo updated.");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <label className="group relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-border bg-raised-bg text-lg font-semibold text-primary-text transition hover:border-border-hover">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${username}'s profile photo`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 shadow-inner transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100">
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <PencilIcon />
          )}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={handlePhotoChange}
          className="sr-only"
        />
      </label>
      <div>
        {message && (
          <div className="mt-2 text-xs text-muted-text">{message}</div>
        )}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

async function readJsonOrThrow<T = unknown>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed.",
    );
  }

  return body as T;
}

function getInitials(value: string) {
  const parts = value
    .replaceAll("@", " ")
    .split(/\s+/)
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
