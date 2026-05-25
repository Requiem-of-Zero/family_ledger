"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useState, useTransition } from "react";

type FriendAction = "accept" | "reject" | "cancel" | "block" | "remove";

type FriendRelationship = {
  id: number;
  status: string;
  direction: string;
  title: string;
  subtitle: string;
  meta: string;
};

type FriendRequestManagerProps = {
  acceptedFriends: FriendRelationship[];
  incomingFriendRequests: FriendRelationship[];
  outgoingFriendRequests: FriendRelationship[];
  blockedFriends: FriendRelationship[];
};

export default function FriendRequestManager({
  acceptedFriends,
  incomingFriendRequests,
  outgoingFriendRequests,
  blockedFriends,
}: FriendRequestManagerProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("send", async () => {
      const res = await fetch("/api/friends", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresseeEmail: email }),
      });

      await assertOk(res);
      setEmail("");
      setMessage("Friend request sent.");
    });
  }

  async function handleFriendAction(id: number, action: FriendAction) {
    await runAction(`${action}-${id}`, async () => {
      const endpoint =
        action === "remove" ? `/api/friends/${id}` : `/api/friends/${id}/${action}`;
      const method = action === "remove" ? "DELETE" : "POST";

      const res = await fetch(endpoint, {
        method,
        credentials: "include",
      });

      await assertOk(res);
      setMessage(getSuccessMessage(action));
    });
  }

  async function runAction(actionKey: string, action: () => Promise<void>) {
    setActiveAction(actionKey);
    setMessage(null);

    try {
      await action();
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setActiveAction(null);
    }
  }

  const busy = activeAction !== null || isPending;

  return (
    <div id="requests" className="scroll-mt-24 rounded-xl border border-border bg-surface-bg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">Friends</h2>
          <p className="mt-1 text-sm text-muted-text">
            Send requests and manage user-level relationships.
          </p>
        </div>
        <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
          {acceptedFriends.length} accepted
        </span>
      </div>

      {/* Email is the stable lookup key for now; later this can become user search. */}
      <form onSubmit={handleSendRequest} className="mt-4 grid gap-3 rounded-xl border border-border bg-raised-bg p-4 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-primary-text">Send friend request</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="friend@example.com"
            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 text-primary-text outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
        >
          {activeAction === "send" ? "Sending..." : "Send"}
        </button>
      </form>

      {message && (
        <div className="mt-3 rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm text-muted-text">
          {message}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <RelationshipPanel
          title="Incoming"
          emptyText="No incoming friend requests."
          items={incomingFriendRequests}
          renderActions={(item) => (
            <>
              <ActionButton
                label="Accept"
                disabled={busy}
                isLoading={activeAction === `accept-${item.id}`}
                onClick={() => handleFriendAction(item.id, "accept")}
              />
              <ActionButton
                label="Reject"
                variant="secondary"
                disabled={busy}
                isLoading={activeAction === `reject-${item.id}`}
                onClick={() => handleFriendAction(item.id, "reject")}
              />
              <ActionButton
                label="Block"
                variant="danger"
                disabled={busy}
                isLoading={activeAction === `block-${item.id}`}
                onClick={() => handleFriendAction(item.id, "block")}
              />
            </>
          )}
        />
        <RelationshipPanel
          title="Outgoing"
          emptyText="No outgoing friend requests."
          items={outgoingFriendRequests}
          renderActions={(item) => (
            <>
              <ActionButton
                label="Cancel"
                variant="secondary"
                disabled={busy}
                isLoading={activeAction === `cancel-${item.id}`}
                onClick={() => handleFriendAction(item.id, "cancel")}
              />
              <ActionButton
                label="Block"
                variant="danger"
                disabled={busy}
                isLoading={activeAction === `block-${item.id}`}
                onClick={() => handleFriendAction(item.id, "block")}
              />
            </>
          )}
        />
      </div>

      <div className="mt-4">
        <RelationshipPanel
          title="Accepted friends"
          emptyText="No accepted friends yet."
          items={acceptedFriends}
          renderActions={(item) => (
            <>
              <ActionButton
                label="Remove"
                variant="secondary"
                disabled={busy}
                isLoading={activeAction === `remove-${item.id}`}
                onClick={() => handleFriendAction(item.id, "remove")}
              />
              <ActionButton
                label="Block"
                variant="danger"
                disabled={busy}
                isLoading={activeAction === `block-${item.id}`}
                onClick={() => handleFriendAction(item.id, "block")}
              />
            </>
          )}
        />
      </div>

      {blockedFriends.length > 0 && (
        <div className="mt-4">
          <RelationshipPanel
            title="Blocked"
            emptyText=""
            items={blockedFriends}
            renderActions={(item) => (
              <ActionButton
                label="Remove"
                variant="secondary"
                disabled={busy}
                isLoading={activeAction === `remove-${item.id}`}
                onClick={() => handleFriendAction(item.id, "remove")}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

function RelationshipPanel({
  title,
  emptyText,
  items,
  renderActions,
}: {
  title: string;
  emptyText: string;
  items: FriendRelationship[];
  renderActions: (item: FriendRelationship) => ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-raised-bg p-4">
      <h3 className="text-sm font-semibold text-primary-text">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-text">{emptyText}</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-surface-bg px-3 py-3"
            >
              <div className="font-medium text-primary-text">{item.title}</div>
              <div className="mt-0.5 text-sm text-muted-text">
                {item.subtitle}
              </div>
              <div className="mt-1 text-xs text-muted-text">{item.meta}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {renderActions(item)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  variant = "primary",
  disabled,
  isLoading,
  onClick,
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  const className =
    variant === "danger"
      ? "border-red-300 bg-red-50 text-red-700 hover:border-red-400"
      : variant === "secondary"
        ? "border-border bg-raised-bg text-primary-text hover:border-border-hover"
        : "border-primary bg-primary text-primary-fg hover:opacity-90";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${className}`}
    >
      {isLoading ? "Working..." : label}
    </button>
  );
}

async function assertOk(res: Response) {
  if (res.ok) return;

  const body = await res.json().catch(() => ({}));
  throw new Error(
    typeof body.error === "string" ? body.error : "Request failed.",
  );
}

function getSuccessMessage(action: FriendAction) {
  switch (action) {
    case "accept":
      return "Friend request accepted.";
    case "reject":
      return "Friend request rejected.";
    case "cancel":
      return "Friend request canceled.";
    case "block":
      return "Friend relationship blocked.";
    case "remove":
      return "Friend relationship removed.";
  }
}
