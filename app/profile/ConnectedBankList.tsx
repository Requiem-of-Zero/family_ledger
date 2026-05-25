"use client";

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
  const [openBankIds, setOpenBankIds] = useState<Set<number>>(new Set());

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

  return (
    <div className="mt-4 grid gap-3">
      {banks.map((bank) => {
        const isOpen = openBankIds.has(bank.id);

        return (
          <div
            key={bank.id}
            className="rounded-xl border border-border bg-raised-bg"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggleBank(bank.id)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-bg"
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
  );
}
