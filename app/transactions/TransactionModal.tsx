"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  type CreateTransactionInput,
  type TransactionType,
  type Transaction,
} from "@/src/shared/validators/transactions";
import { formatMoney } from "@/src/shared/utils/format";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultType: TransactionType;
  transaction?: Transaction | null; // if null we will create, if not null, we will edit
  onSaved: () => void; // Called if created OR edit succeeds
};

// Helper function: Date -> "YYYY-MM-DDTHH:mm" for datetime-local inputs
function toDateTimeLocalString(inDate: Date) {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${inDate.getFullYear()}-${pad(inDate.getMonth() + 1)}-${pad(inDate.getDate())}T${pad(
    inDate.getHours(),
  )}:${pad(inDate.getMinutes())}`;
}

export default function TransactionModal({
  isOpen,
  onClose,
  defaultType,
  transaction = null,
  onSaved,
}: Props) {
  const isEdit = Boolean(transaction);

  const [type, setType] = useState<TransactionType>(defaultType);
  // const [amountCents, setAmountCents] = useState<number>(0);
  const [amountDigits, setAmountDigits] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(""); // use datetime-local string
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = amountDigits ? Number(amountDigits) : 0;

  const displayDollars = useMemo(() => {
    const dollars = amountCents / 100;

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(dollars);
    
  }, [amountCents]);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);

    if (transaction) {
      // EDIT: Prefill fields from the transaction
      setType(transaction.type);
      setAmountDigits(String(transaction.amountCents));
      setMerchant(transaction.merchant ?? "");
      setNote(transaction.note ?? "");
      setOccurredAt(toDateTimeLocalString(new Date(transaction.occurredAt)));
    } else {
      // CREATE: Reset to defaults
      setType(defaultType);
      setAmountDigits("");
      setMerchant("");
      setNote("");
      setOccurredAt("");
    }
  }, [defaultType, isOpen, transaction]);

  if (!isOpen) return null;

  const merchantLabel = type === "INCOME" ? "Source" : "Merchant";
  const merchantPlaceholder =
    type === "INCOME" ? "Payroll / Client / Refund" : "Amazon / Safeway / Uber";

  async function handleDelete() {
    if (!transaction) return; // only in edit mode

    const ok = window.confirm(
      `Delete this transaction?\n\n${transaction.type} • ${formatMoney(transaction.amountCents, "USD")}\n${transaction.merchant ?? ""}`,
    );
    if (!ok) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof body?.error === "string"
            ? body.error
            : typeof body?.message === "string"
              ? body.message
              : "Failed to delete transaction.";
        throw new Error(msg);
      }

      onClose();
      onSaved(); // refresh list
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete transaction.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); // Clear previous errors
    setIsSubmitting(true);

    try {
      const occurredAtDate = occurredAt ? new Date(occurredAt) : new Date();

      if (amountCents <= 0) {
        setError("Amount must be greater than $0.00");
        return;
      }
      if (!isEdit) {
        // ----------------
        // CREATE (POST)
        // ----------------
        const payload: CreateTransactionInput = {
          type,
          amountCents,
          occurredAt: occurredAtDate,
          merchant: merchant.trim() ? merchant.trim() : undefined,
          note: note.trim() ? note.trim() : undefined,
        };

        const parsed = CreateTransactionSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
        }

        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(parsed.data),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Failed to create transaction.",
          );
        }
      } else {
        // ----------------
        // EDIT (PATCH)
        // ----------------
        if (!transaction) throw new Error("Missing transaction to edit.");

        // For PATCH, we can send only updatable fields.
        const patchPayload = {
          type,
          amountCents,
          occurredAt: occurredAtDate,
          merchant: merchant.trim() ? merchant.trim() : undefined,
          note: note.trim() ? note.trim() : undefined,
        };

        const parsed = UpdateTransactionSchema.safeParse(patchPayload);
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
        }

        const res = await fetch(`/api/transactions/${transaction.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(parsed.data),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Failed to update transaction.",
          );
        }
      }

      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close modal"
        type="button"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-card border border-border bg-surface-bg p-5 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {isEdit ? "Edit transaction" : "Add transaction"}
            </h2>
            <p className="mt-1 text-sm text-muted-text">
              {isEdit
                ? "Update this entry."
                : `Create a new ${defaultType.toLowerCase()} entry.`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-raised-bg px-3 py-1.5 text-sm text-muted-text hover:border-border-hover"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-danger bg-danger-bg px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Type
            </label>
            <div className="grid grid-cols-2 rounded-xl border border-border bg-raised-bg p-1">
              <button
                type="button"
                onClick={() => setType("EXPENSE")}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  type === "EXPENSE"
                    ? "bg-primary text-primary-fg"
                    : "text-muted-text hover:text-primary-text",
                ].join(" ")}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setType("INCOME")}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  type === "INCOME"
                    ? "bg-primary text-primary-fg"
                    : "text-muted-text hover:text-primary-text",
                ].join(" ")}
              >
                Income
              </button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Amount
            </label>

            <input
              type="text"
              inputMode="numeric"
              value={displayDollars}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "");
                setAmountDigits(digitsOnly);
              }}
              onFocus={(e) => {
                requestAnimationFrame(() => {
                  const el = e.target;
                  el.setSelectionRange(el.value.length, el.value.length);
                });
              }}
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
              placeholder="$0.00"
              required
            />

            <p className="text-xs text-muted-text">
              Type numbers only. Example: 1256 → $12.56
            </p>
          </div>

          {/* Merchant / Source */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              {merchantLabel}
            </label>
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
              placeholder={merchantPlaceholder}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
              placeholder="Optional details…"
            />
          </div>

          {/* Occurred at */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Occurred at
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
            />
            <p className="text-xs text-muted-text">Leave empty to use “now”.</p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting
                ? "Working…"
                : transaction
                  ? "Save changes"
                  : "Create"}
            </button>

            {transaction && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDelete}
                className="rounded-xl border border-danger bg-danger-bg px-4 py-2 text-sm font-semibold text-danger-text transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
