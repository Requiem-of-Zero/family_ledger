"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useState, useTransition } from "react";

type FamilyJoinAction = "accept" | "reject" | "cancel";

type OwnedFamilyOption = {
  id: number;
  name: string;
};

type FamilyJoinRequestItem = {
  id: number;
  status: string;
  direction: "RECEIVED" | "SENT";
  familyName: string;
  title: string;
  subtitle: string;
  meta: string;
};

type FamilyRequestManagerProps = {
  ownedFamilies: OwnedFamilyOption[];
  incomingRequests: FamilyJoinRequestItem[];
  outgoingRequests: FamilyJoinRequestItem[];
  completedRequests: FamilyJoinRequestItem[];
};

// Client-side manager for the invite workflow. The server page provides a
// snapshot, and each mutation refreshes that snapshot after the API call.
export default function FamilyRequestManager({
  ownedFamilies,
  incomingRequests,
  outgoingRequests,
  completedRequests,
}: FamilyRequestManagerProps) {
  const router = useRouter();
  const [familyId, setFamilyId] = useState(
    ownedFamilies[0] ? String(ownedFamilies[0].id) : "",
  );
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Owners invite an existing user into one of their owned families by email.
  async function handleSendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("send-family-invite", async () => {
      const res = await fetch("/api/family-join-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          familyId,
          addresseeEmail: email,
        }),
      });

      await assertOk(res);
      setEmail("");
      setMessage("Family invite sent.");
    });
  }

  // Pending invites have recipient-side actions and owner/requester cancel.
  async function handleFamilyJoinAction(
    id: number,
    action: FamilyJoinAction,
  ) {
    await runAction(`${action}-family-invite-${id}`, async () => {
      const res = await fetch(`/api/family-join-requests/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      await assertOk(res);
      setMessage(getSuccessMessage(action));
    });
  }

  // Shared action wrapper keeps loading, messages, and server refresh consistent.
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
    <div className="rounded-xl border border-border bg-surface-bg p-5">
      {/* Header summary for quick request scanning. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">
            Family invites
          </h2>
          <p className="mt-1 text-sm text-muted-text">
            Invite users into your family and respond to family join requests.
          </p>
        </div>
        <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
          {incomingRequests.length} incoming
        </span>
      </div>

      {/* Family owners send invites by email; acceptance creates membership. */}
      <form
        onSubmit={handleSendRequest}
        className="mt-4 grid gap-3 rounded-xl border border-border bg-raised-bg p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto]"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-primary-text">Family</span>
          <select
            required
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
            disabled={ownedFamilies.length === 0 || busy}
            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 text-primary-text outline-none focus:border-primary disabled:opacity-60"
          >
            {ownedFamilies.length === 0 ? (
              <option value="">No owned families</option>
            ) : (
              ownedFamilies.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-primary-text">Invite by email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={ownedFamilies.length === 0 || busy}
            placeholder="member@example.com"
            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 text-primary-text outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={ownedFamilies.length === 0 || busy}
          className="self-end rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
        >
          {activeAction === "send-family-invite" ? "Sending..." : "Send"}
        </button>
      </form>

      {message && (
        <div className="mt-3 rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm text-muted-text">
          {message}
        </div>
      )}

      {/* Active request queues: incoming for the invited user, outgoing for owners. */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FamilyRequestPanel
          title="Incoming"
          emptyText="No incoming family invites."
          items={incomingRequests}
          renderActions={(item) => (
            <>
              <ActionButton
                label="Accept"
                disabled={busy}
                isLoading={activeAction === `accept-family-invite-${item.id}`}
                onClick={() => handleFamilyJoinAction(item.id, "accept")}
              />
              <ActionButton
                label="Reject"
                variant="secondary"
                disabled={busy}
                isLoading={activeAction === `reject-family-invite-${item.id}`}
                onClick={() => handleFamilyJoinAction(item.id, "reject")}
              />
            </>
          )}
        />
        <FamilyRequestPanel
          title="Outgoing"
          emptyText="No outgoing family invites."
          items={outgoingRequests}
          renderActions={(item) => (
            <ActionButton
              label="Cancel"
              variant="secondary"
              disabled={busy}
              isLoading={activeAction === `cancel-family-invite-${item.id}`}
              onClick={() => handleFamilyJoinAction(item.id, "cancel")}
            />
          )}
        />
      </div>

      {/* Completed rows stay visible so users can understand recent invite state. */}
      {completedRequests.length > 0 && (
        <div className="mt-4">
          <FamilyRequestPanel
            title="History"
            emptyText=""
            items={completedRequests}
            renderActions={(item) => (
              <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                {item.status}
              </span>
            )}
          />
        </div>
      )}
    </div>
  );
}

// Reusable compact list panel for incoming, outgoing, and historical requests.
function FamilyRequestPanel({
  title,
  emptyText,
  items,
  renderActions,
}: {
  title: string;
  emptyText: string;
  items: FamilyJoinRequestItem[];
  renderActions: (item: FamilyJoinRequestItem) => ReactNode;
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
              <div className="text-xs font-semibold uppercase text-muted-text">
                {item.familyName}
              </div>
              <div className="mt-1 font-medium text-primary-text">
                {item.title}
              </div>
              <div className="mt-0.5 break-words text-sm text-muted-text">
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

// Small local button helper keeps request actions visually consistent.
function ActionButton({
  label,
  variant = "primary",
  disabled,
  isLoading,
  onClick,
}: {
  label: string;
  variant?: "primary" | "secondary";
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  const className =
    variant === "secondary"
      ? "border-border bg-raised-bg text-primary-text hover:border-border-hover"
      : "border-primary bg-primary text-primary-fg hover:opacity-90";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${className}`}
    >
      {isLoading ? "Working..." : label}
    </button>
  );
}

// Route handlers return { error } on failures; surface that in the card.
async function assertOk(res: Response) {
  if (res.ok) return;

  const body = await res.json().catch(() => null);
  throw new Error(body?.error ?? "Request failed.");
}

// Human-readable success text for the toast-like inline status message.
function getSuccessMessage(action: FamilyJoinAction) {
  if (action === "accept") return "Family invite accepted.";
  if (action === "reject") return "Family invite rejected.";
  return "Family invite canceled.";
}
