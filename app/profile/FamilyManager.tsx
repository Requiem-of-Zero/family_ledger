"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

type FamilyMembershipItem = {
  id: number;
  name: string;
  memberRole: string;
  joinedAtLabel: string;
};

type FamilyManagerProps = {
  families: FamilyMembershipItem[];
};

// Client-side family CRUD manager. The server page owns the source-of-truth
// snapshot, and mutations refresh it after the API responds.
export default function FamilyManager({ families }: FamilyManagerProps) {
  const router = useRouter();
  const [newFamilyName, setNewFamilyName] = useState("");
  const [editingFamilyId, setEditingFamilyId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreateFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("create-family", async () => {
      const res = await fetch("/api/families", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newFamilyName }),
      });

      await assertOk(res);
      setNewFamilyName("");
      setMessage("Family created.");
    });
  }

  function startRename(family: FamilyMembershipItem) {
    setEditingFamilyId(family.id);
    setEditingName(family.name);
    setMessage(null);
  }

  async function handleRenameFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFamilyId) return;

    await runAction(`rename-family-${editingFamilyId}`, async () => {
      const res = await fetch(`/api/families/${editingFamilyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editingName }),
      });

      await assertOk(res);
      setEditingFamilyId(null);
      setEditingName("");
      setMessage("Family renamed.");
    });
  }

  async function handleDeleteFamily(familyId: number) {
    await runAction(`delete-family-${familyId}`, async () => {
      const res = await fetch(`/api/families/${familyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      await assertOk(res);
      setMessage("Family deleted.");
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
    <div className="rounded-xl border border-border bg-surface-bg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">Families</h2>
          <p className="mt-1 text-sm text-muted-text">
            Create households, rename owned families, or remove ones you own.
          </p>
        </div>
        <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
          {families.length} active
        </span>
      </div>

      {/* Creating a family makes the current user the first owner. */}
      <form
        onSubmit={handleCreateFamily}
        className="mt-4 grid gap-3 rounded-xl border border-border bg-raised-bg p-4 sm:grid-cols-[1fr_auto]"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-primary-text">New family</span>
          <input
            required
            value={newFamilyName}
            onChange={(event) => setNewFamilyName(event.target.value)}
            disabled={busy}
            placeholder="Household name"
            className="min-h-11 rounded-xl border border-border bg-surface-bg px-3 text-primary-text outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
        >
          {activeAction === "create-family" ? "Creating..." : "Create"}
        </button>
      </form>

      {message && (
        <div className="mt-3 rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm text-muted-text">
          {message}
        </div>
      )}

      <div className="mt-4 divide-y divide-border">
        {families.length === 0 ? (
          <div className="rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm text-muted-text">
            No active families yet.
          </div>
        ) : (
          families.map((family) => {
            const isOwner = family.memberRole === "OWNER";
            const isEditing = editingFamilyId === family.id;

            return (
              <div
                key={family.id}
                className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                {isEditing ? (
                  <form
                    onSubmit={handleRenameFamily}
                    className="grid gap-3 sm:col-span-2 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <input
                      required
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      disabled={busy}
                      className="min-h-10 rounded-xl border border-border bg-surface-bg px-3 text-primary-text outline-none focus:border-primary disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
                    >
                      {activeAction === `rename-family-${family.id}`
                        ? "Saving..."
                        : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingFamilyId(null)}
                      className="rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="font-semibold text-primary-text">
                        {family.name}
                      </div>
                      <div className="mt-1 text-sm text-muted-text">
                        Joined {family.joinedAtLabel}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                        {family.memberRole}
                      </span>
                      {isOwner && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startRename(family)}
                            className="rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover disabled:opacity-60"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDeleteFamily(family.id)}
                            className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-400 disabled:opacity-60"
                          >
                            {activeAction === `delete-family-${family.id}`
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Route handlers return { error } on failures; surface that in the card.
async function assertOk(res: Response) {
  if (res.ok) return;

  const body = await res.json().catch(() => null);
  throw new Error(body?.error ?? "Request failed.");
}
