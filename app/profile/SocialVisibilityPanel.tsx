"use client";

import { useState, useTransition } from "react";

type SocialVisibilityPanelProps = {
  friendCount: number;
  friendGroupCount: number;
  initialShowFriends: boolean;
  initialShowFriendGroups: boolean;
};

export default function SocialVisibilityPanel({
  friendCount,
  friendGroupCount,
  initialShowFriends,
  initialShowFriendGroups,
}: SocialVisibilityPanelProps) {
  const [showFriends, setShowFriends] = useState(initialShowFriends);
  const [showFriendGroups, setShowFriendGroups] = useState(
    initialShowFriendGroups,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateVisibility(setting: "friends" | "friendGroups", value: boolean) {
    // Optimistically reflect the user's choice, then persist the matching DB
    // field. If the request fails, roll back the specific switch.
    const body =
      setting === "friends"
        ? { showFriendsOnProfile: value }
        : { showFriendGroupsOnProfile: value };
    const rollback =
      setting === "friends"
        ? () => setShowFriends(!value)
        : () => setShowFriendGroups(!value);

    if (setting === "friends") {
      setShowFriends(value);
    } else {
      setShowFriendGroups(value);
    }

    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/profile/social-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        rollback();
        const error = await res.json().catch(() => null);
        setMessage(error?.error ?? "Could not save visibility setting.");
        return;
      }

      setMessage("Visibility saved.");
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface-bg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">
            Social visibility
          </h2>
          <p className="mt-1 text-sm text-muted-text">
            Choose which personal social lists are visible on your profile.
          </p>
        </div>
        <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
          Saved setting
        </span>
      </div>

      {/* Visibility is persisted per user so the profile can consistently render
          only the social lists the user wants exposed. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <VisibilityToggle
          disabled={isPending}
          enabled={showFriends}
          label="Friends"
          onClick={() => updateVisibility("friends", !showFriends)}
        />
        <VisibilityToggle
          disabled={isPending}
          enabled={showFriendGroups}
          label="Friend groups"
          onClick={() => updateVisibility("friendGroups", !showFriendGroups)}
        />
      </div>

      {message && <p className="mt-3 text-xs text-muted-text">{message}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <VisibilitySummary
          enabled={showFriends}
          label="Friends"
          value={friendCount}
        />
        <VisibilitySummary
          enabled={showFriendGroups}
          label="Friend groups"
          value={friendGroupCount}
        />
      </div>
    </section>
  );
}

function VisibilityToggle({
  disabled,
  enabled,
  label,
  onClick,
}: {
  disabled: boolean;
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
        enabled
          ? "border-primary bg-raised-bg text-primary-text"
          : "border-border bg-surface-bg text-muted-text hover:text-primary-text",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function VisibilitySummary({
  enabled,
  label,
  value,
}: {
  enabled: boolean;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-raised-bg px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-primary-text">{label}</div>
          <div className="mt-1 text-xs text-muted-text">
            {enabled ? "Visible on profile" : "Hidden on profile"}
          </div>
        </div>
        <div className="text-2xl font-semibold text-primary-text">
          {value}
        </div>
      </div>
    </div>
  );
}
