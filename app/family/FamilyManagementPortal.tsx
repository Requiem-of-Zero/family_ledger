"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

type UserSummary = {
  id: number;
  email: string;
  username: string;
};

type FamilyMemberItem = {
  id: number;
  role: string;
  relationshipLabel: string | null;
  joinedAtLabel: string;
  user: UserSummary;
};

type FamilyItem = {
  id: number;
  name: string;
  currentUserRole: string;
  joinedAtLabel: string;
  canManage: boolean;
  members: FamilyMemberItem[];
};

type FamilyJoinRequestItem = {
  id: number;
  familyId: number;
  familyName: string;
  status: string;
  direction: string;
  canManage: boolean;
  requester: UserSummary;
  addressee: UserSummary;
  createdAtLabel: string;
};

type FamilyFriendItem = {
  id: number;
  requesterFamilyId: number;
  addresseeFamilyId: number;
  requesterFamilyName: string;
  addresseeFamilyName: string;
  status: string;
  direction: string;
  canManageRequester: boolean;
  canManageAddressee: boolean;
  createdAtLabel: string;
};

type FamilyManagementPortalProps = {
  families: FamilyItem[];
  familyFriends: FamilyFriendItem[];
  joinRequests: FamilyJoinRequestItem[];
};

export default function FamilyManagementPortal({
  families,
  familyFriends,
  joinRequests,
}: FamilyManagementPortalProps) {
  const router = useRouter();
  const [selectedFamilyId, setSelectedFamilyId] = useState(
    families[0] ? String(families[0].id) : "",
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [familyFriendIdentifier, setFamilyFriendIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedFamily = useMemo(
    () =>
      families.find((family) => String(family.id) === selectedFamilyId) ??
      families[0] ??
      null,
    [families, selectedFamilyId],
  );

  const pendingJoinRequests = joinRequests.filter(
    (request) => request.status === "PENDING",
  );
  const completedJoinRequests = joinRequests.filter(
    (request) => request.status !== "PENDING",
  );
  const relatedFamilyFriends = selectedFamily
    ? familyFriends.filter(
        (relationship) =>
          relationship.requesterFamilyId === selectedFamily.id ||
          relationship.addresseeFamilyId === selectedFamily.id,
      )
    : familyFriends;
  const busy = activeAction !== null || isPending;

  // All portal mutations use the JSON API routes, then refresh the server
  // snapshot so member lists and pending queues stay authoritative.
  async function runAction(actionKey: string, action: () => Promise<void>) {
    setActiveAction(actionKey);
    setMessage(null);

    try {
      await action();
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setActiveAction(null);
    }
  }

  // Owner/co-owner invite flow. Acceptance is handled by the invited user from
  // their own incoming request queue.
  async function sendFamilyInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFamily) return;

    await runAction("send-family-invite", async () => {
      const res = await fetch("/api/family-join-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          familyId: selectedFamily.id,
          addresseeEmail: inviteEmail,
        }),
      });

      await assertOk(res);
      setInviteEmail("");
      setMessage("Family invite sent.");
    });
  }

  // Owners can label members and promote/demote non-owner members. Owner
  // transfer is intentionally left to a future safer workflow.
  async function updateMember(
    member: FamilyMemberItem,
    data: { relationshipLabel?: string | null; memberRole?: "CO_OWNER" | "MEMBER" },
  ) {
    if (!selectedFamily) return;

    await runAction(`update-member-${member.id}`, async () => {
      const res = await fetch(
        `/api/families/${selectedFamily.id}/members/${member.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );

      await assertOk(res);
      setMessage("Member updated.");
    });
  }

  async function removeMember(member: FamilyMemberItem) {
    if (!selectedFamily) return;

    await runAction(`remove-member-${member.id}`, async () => {
      const res = await fetch(
        `/api/families/${selectedFamily.id}/members/${member.id}`,
        { method: "DELETE", credentials: "include" },
      );

      await assertOk(res);
      setMessage("Member removed.");
    });
  }

  // Family friend requests let one family expose/share with another family. The
  // target is resolved from a person so owners do not need raw family ids.
  async function sendFamilyFriendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFamily) return;

    await runAction("send-family-friend", async () => {
      const res = await fetch("/api/family-friends", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requesterFamilyId: selectedFamily.id,
          addresseeIdentifier: familyFriendIdentifier,
        }),
      });

      await assertOk(res);
      setFamilyFriendIdentifier("");
      setMessage("Family friend request sent.");
    });
  }

  async function handleRequestAction(
    id: number,
    action: "accept" | "reject" | "cancel",
  ) {
    await runAction(`${action}-family-request-${id}`, async () => {
      const res = await fetch(`/api/family-join-requests/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      await assertOk(res);
      setMessage("Family request updated.");
    });
  }

  async function handleFamilyFriendAction(
    id: number,
    action: "accept" | "reject" | "cancel",
  ) {
    await runAction(`${action}-family-friend-${id}`, async () => {
      const res = await fetch(`/api/family-friends/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      await assertOk(res);
      setMessage("Family friend request updated.");
    });
  }

  return (
    <main className="min-h-screen bg-primary-bg px-4 py-8 text-primary-text">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">Family</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Management portal
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-text">
              Manage members, invitations, and family-to-family relationships.
            </p>
          </div>
          <span className="rounded-xl border border-border bg-surface-bg px-3 py-2 text-xs font-semibold text-muted-text">
            {families.length} active families
          </span>
        </header>

        {message && (
          <div className="rounded-xl border border-border bg-surface-bg px-4 py-3 text-sm text-muted-text">
            {message}
          </div>
        )}

        {families.length === 0 ? (
          <section className="rounded-xl border border-border bg-surface-bg p-5 text-sm text-muted-text">
            You are not part of an active family yet.
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <FamilySelector
                families={families}
                selectedFamilyId={selectedFamily?.id ?? null}
                onSelect={(familyId) => setSelectedFamilyId(String(familyId))}
              />

              {selectedFamily && (
                <>
                  <section className="rounded-xl border border-border bg-surface-bg p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {selectedFamily.name}
                        </h2>
                        <p className="mt-1 text-sm text-muted-text">
                          Joined {selectedFamily.joinedAtLabel} as{" "}
                          {selectedFamily.currentUserRole}
                        </p>
                      </div>
                      <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                        {selectedFamily.members.length} members
                      </span>
                    </div>

                    {selectedFamily.canManage && (
                      <form
                        onSubmit={sendFamilyInvite}
                        className="mt-4 grid gap-3 rounded-xl border border-border bg-raised-bg p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <label className="grid gap-1 text-sm">
                          <span className="font-semibold">Invite member</span>
                          <input
                            type="email"
                            required
                            value={inviteEmail}
                            onChange={(event) =>
                              setInviteEmail(event.target.value)
                            }
                            disabled={busy}
                            placeholder="member@example.com"
                            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 outline-none focus:border-primary disabled:opacity-60"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={busy}
                          className="self-end rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
                        >
                          {activeAction === "send-family-invite"
                            ? "Sending..."
                            : "Send invite"}
                        </button>
                      </form>
                    )}

                    <div className="mt-4 grid gap-3">
                      {selectedFamily.members.map((member) => (
                        <MemberRow
                          key={member.id}
                          busy={busy}
                          canManage={selectedFamily.canManage}
                          member={member}
                          onRemove={() => removeMember(member)}
                          onUpdate={(data) => updateMember(member, data)}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-surface-bg p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Family friends</h2>
                        <p className="mt-1 text-sm text-muted-text">
                          Show which families are connected to this household.
                        </p>
                      </div>
                      <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                        {
                          relatedFamilyFriends.filter(
                            (relationship) =>
                              relationship.status === "ACCEPTED",
                          ).length
                        }{" "}
                        accepted
                      </span>
                    </div>

                    {selectedFamily.canManage && (
                      <form
                        onSubmit={sendFamilyFriendRequest}
                        className="mt-4 grid gap-3 rounded-xl border border-border bg-raised-bg p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <label className="grid gap-1 text-sm">
                          <span className="font-semibold">
                            Request family friend
                          </span>
                          <input
                            required
                            value={familyFriendIdentifier}
                            onChange={(event) =>
                              setFamilyFriendIdentifier(event.target.value)
                            }
                            disabled={busy}
                            placeholder="owner@example.com or username"
                            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 outline-none focus:border-primary disabled:opacity-60"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={busy}
                          className="self-end rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm font-semibold hover:border-border-hover disabled:opacity-60"
                        >
                          Send request
                        </button>
                      </form>
                    )}

                    <FamilyFriendList
                      busy={busy}
                      familyFriends={relatedFamilyFriends}
                      onAction={handleFamilyFriendAction}
                    />
                  </section>
                </>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-border bg-surface-bg p-5">
                <h2 className="text-lg font-semibold">Pending requests</h2>
                <p className="mt-1 text-sm text-muted-text">
                  Invitations into families and their recent outcomes.
                </p>
                <RequestList
                  busy={busy}
                  completedRequests={completedJoinRequests}
                  pendingRequests={pendingJoinRequests}
                  onAction={handleRequestAction}
                />
              </section>

            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function FamilySelector({
  families,
  selectedFamilyId,
  onSelect,
}: {
  families: FamilyItem[];
  selectedFamilyId: number | null;
  onSelect: (familyId: number) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-bg p-3">
      <div className="flex gap-2 overflow-x-auto">
        {families.map((family) => (
          <button
            key={family.id}
            type="button"
            onClick={() => onSelect(family.id)}
            className={[
              "shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition",
              selectedFamilyId === family.id
                ? "border-primary bg-raised-bg text-primary-text"
                : "border-border bg-raised-bg text-muted-text hover:text-primary-text",
            ].join(" ")}
          >
            <div className="font-semibold">{family.name}</div>
            <div className="mt-1 text-xs">{family.currentUserRole}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MemberRow({
  busy,
  canManage,
  member,
  onRemove,
  onUpdate,
}: {
  busy: boolean;
  canManage: boolean;
  member: FamilyMemberItem;
  onRemove: () => void;
  onUpdate: (data: {
    relationshipLabel?: string | null;
    memberRole?: "CO_OWNER" | "MEMBER";
  }) => void;
}) {
  const [label, setLabel] = useState(member.relationshipLabel ?? "");
  const isOwner = member.role === "OWNER";

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-raised-bg p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="font-semibold">{member.user.username}</div>
        <div className="mt-1 text-sm text-muted-text">{member.user.email}</div>
        <div className="mt-1 text-xs text-muted-text">
          Joined {member.joinedAtLabel}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,160px)_auto]">
        <select
          value={member.role}
          disabled={!canManage || isOwner || busy}
          onChange={(event) =>
            onUpdate({ memberRole: event.target.value as "CO_OWNER" | "MEMBER" })
          }
          className="min-h-10 rounded-xl border border-border bg-surface-bg px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          <option value="OWNER">Owner</option>
          <option value="CO_OWNER">Co-owner</option>
          <option value="MEMBER">Member</option>
        </select>

        <input
          value={label}
          disabled={!canManage || busy}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() =>
            onUpdate({ relationshipLabel: label.trim() ? label.trim() : null })
          }
          placeholder="Mother, sibling..."
          className="min-h-10 rounded-xl border border-border bg-surface-bg px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
        />

        <button
          type="button"
          disabled={!canManage || isOwner || busy}
          onClick={onRemove}
          className="rounded-xl border border-border bg-surface-bg px-3 py-2 text-sm font-semibold text-muted-text hover:border-border-hover hover:text-primary-text disabled:opacity-60"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function RequestList({
  busy,
  completedRequests,
  pendingRequests,
  onAction,
}: {
  busy: boolean;
  completedRequests: FamilyJoinRequestItem[];
  pendingRequests: FamilyJoinRequestItem[];
  onAction: (id: number, action: "accept" | "reject" | "cancel") => void;
}) {
  return (
    <div className="mt-4 grid gap-2">
      {pendingRequests.length === 0 ? (
        <div className="rounded-xl border border-border bg-raised-bg px-3 py-3 text-sm text-muted-text">
          No pending family requests.
        </div>
      ) : (
        pendingRequests.map((request) => (
          <div
            key={request.id}
            className="rounded-xl border border-border bg-raised-bg px-3 py-3"
          >
            <div className="text-sm font-semibold">{request.familyName}</div>
            <div className="mt-1 text-xs text-muted-text">
              {request.direction === "RECEIVED"
                ? `From ${request.requester.username}`
                : `To ${request.addressee.username}`}{" "}
              on {request.createdAtLabel}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {request.direction === "RECEIVED" ? (
                <>
                  <SmallAction
                    disabled={busy}
                    label="Accept"
                    onClick={() => onAction(request.id, "accept")}
                  />
                  <SmallAction
                    disabled={busy}
                    label="Reject"
                    onClick={() => onAction(request.id, "reject")}
                  />
                </>
              ) : (
                <SmallAction
                  disabled={busy || !request.canManage}
                  label="Cancel"
                  onClick={() => onAction(request.id, "cancel")}
                />
              )}
            </div>
          </div>
        ))
      )}

      {completedRequests.slice(0, 4).map((request) => (
        <div
          key={request.id}
          className="rounded-xl border border-border bg-raised-bg px-3 py-3 text-sm text-muted-text"
        >
          {request.familyName}: {request.status}
        </div>
      ))}
    </div>
  );
}

function FamilyFriendList({
  busy,
  familyFriends,
  onAction,
}: {
  busy: boolean;
  familyFriends: FamilyFriendItem[];
  onAction: (id: number, action: "accept" | "reject" | "cancel") => void;
}) {
  return (
    <div className="mt-4 grid gap-2">
      {familyFriends.length === 0 ? (
        <div className="rounded-xl border border-border bg-raised-bg px-3 py-3 text-sm text-muted-text">
          No family friends yet.
        </div>
      ) : (
        familyFriends.map((relationship) => (
          <div
            key={relationship.id}
            className="rounded-xl border border-border bg-raised-bg px-3 py-3"
          >
            <div className="font-semibold">
              {relationship.requesterFamilyName} and{" "}
              {relationship.addresseeFamilyName}
            </div>
            <div className="mt-1 text-xs text-muted-text">
              {relationship.status} since {relationship.createdAtLabel}
            </div>
            {relationship.status === "PENDING" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {relationship.canManageAddressee ? (
                  <>
                    <SmallAction
                      disabled={busy}
                      label="Accept"
                      onClick={() => onAction(relationship.id, "accept")}
                    />
                    <SmallAction
                      disabled={busy}
                      label="Reject"
                      onClick={() => onAction(relationship.id, "reject")}
                    />
                  </>
                ) : (
                  <SmallAction
                    disabled={busy || !relationship.canManageRequester}
                    label="Cancel"
                    onClick={() => onAction(relationship.id, "cancel")}
                  />
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function SmallAction({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-border bg-surface-bg px-3 py-1.5 text-xs font-semibold text-primary-text hover:border-border-hover disabled:opacity-60"
    >
      {label}
    </button>
  );
}

async function assertOk(res: Response) {
  if (res.ok) return;

  const body = await res.json().catch(() => null);
  throw new Error(body?.error ?? "Request failed.");
}
