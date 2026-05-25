"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConnectedBankAccount = {
  id: number;
  name: string;
  officialName: string | null;
  mask: string | null;
  typeLabel: string;
};

type ConnectedBank = {
  id: number;
  institutionName: string;
  connectedAtLabel: string;
  accounts: ConnectedBankAccount[];
};

type Props = {
  banks: ConnectedBank[];
};

export default function ConnectedBankList({ banks }: Props) {
  const router = useRouter();
  const [openBankIds, setOpenBankIds] = useState<Set<number>>(new Set());
  const [disconnectingBankId, setDisconnectingBankId] = useState<number | null>(
    null,
  );
  const [disconnectingBank, setDisconnectingBank] =
    useState<ConnectedBank | null>(null);
  const [deleteImportedTransactions, setDeleteImportedTransactions] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBank(bankId: number) {
    setOpenBankIds((current) => {
      const next = new Set(current);

      if (next.has(bankId)) {
        next.delete(bankId);
      } else {
        next.add(bankId);
      }

      return next;
    });
  }

  function openDisconnectModal(bank: ConnectedBank) {
    setDisconnectingBank(bank);
    setDeleteImportedTransactions(false);
    setError(null);
  }

  async function disconnectBank() {
    if (!disconnectingBank) return;

    setDisconnectingBankId(disconnectingBank.id);
    setError(null);

    try {
      const res = await fetch(`/api/plaid/items/${disconnectingBank.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deleteImportedTransactions }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to disconnect bank");
      }

      setDisconnectingBank(null);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to disconnect bank",
      );
    } finally {
      setDisconnectingBankId(null);
    }
  }

  return (
    <>
      {disconnectingBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-bg p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-primary-text">
              Disconnect {disconnectingBank.institutionName}
            </h3>
            <p className="mt-2 text-sm text-muted-text">
              This removes the bank connection and stored account records.
              Existing imported transactions can stay in your ledger.
            </p>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-raised-bg p-3 text-sm text-primary-text">
              <input
                type="checkbox"
                checked={deleteImportedTransactions}
                onChange={(event) =>
                  setDeleteImportedTransactions(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
              />
              <span>
                Also clear imported transactions from this connection
              </span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisconnectingBank(null)}
                disabled={disconnectingBankId !== null}
                className="rounded-xl border border-border bg-raised-bg px-4 py-2 text-sm font-semibold text-primary-text hover:border-border-hover disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={disconnectBank}
                disabled={disconnectingBankId !== null}
                className="rounded-xl border border-danger bg-danger-bg px-4 py-2 text-sm font-semibold text-danger-text hover:opacity-90 disabled:opacity-70"
              >
                {disconnectingBankId === disconnectingBank.id
                  ? "Disconnecting..."
                  : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3">
      {error && (
        <div className="rounded-xl border border-danger bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {banks.map((bank) => {
        const isOpen = openBankIds.has(bank.id);
        const isDisconnecting = disconnectingBankId === bank.id;

        return (
          <div
            key={bank.id}
            className="rounded-xl border border-border bg-raised-bg"
          >
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleBank(bank.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-bg"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-primary-text">
                    {bank.institutionName}
                  </div>
                  <div className="mt-1 text-sm text-muted-text">
                    Connected {bank.connectedAtLabel}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                    {bank.accounts.length} accounts
                  </span>
                  <span className="text-sm text-muted-text">
                    {isOpen ? "Hide" : "View"}
                  </span>
                </div>
              </button>
              <div className="grid border-t border-border sm:border-l sm:border-t-0">
                <button
                  type="button"
                  onClick={() => openDisconnectModal(bank)}
                  disabled={isDisconnecting}
                  className="px-4 py-3 text-sm font-semibold text-danger-text hover:bg-danger-bg disabled:opacity-70"
                >
                  {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="grid gap-3 border-t border-border p-4">
                {bank.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-xl border border-border bg-surface-bg px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-primary-text">
                          {account.name}
                        </div>
                        {account.officialName && (
                          <div className="mt-1 text-sm text-muted-text">
                            {account.officialName}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-sm text-muted-text">
                        <div>{account.typeLabel}</div>
                        {account.mask && <div>•••• {account.mask}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </>
  );
}
