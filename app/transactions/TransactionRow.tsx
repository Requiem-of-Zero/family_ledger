import type { Transaction } from "@/src/shared/validators/transactions";
import { formatDate, formatMoney } from "@/src/shared/utils/format";

type Props = {
  tx: Transaction;
  groupingColor?: string;
  currency?: string;
  onDetails?: (id: number) => void;
  onDelete?: (id: number) => void;
  onEdit?: (tx: Transaction) => void;
};

export default function TransactionRow({
  tx,
  groupingColor,
  currency = "USD",
  onDetails,
  onEdit,
  onDelete,
}: Props) {
  const isIncome = tx.type === "INCOME";
  const amountClass = isIncome ? "text-emerald-400" : "text-red-400";
  const typeChipClass = isIncome
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-red-500/40 bg-red-500/10 text-red-300";
  const amountPrefix = isIncome ? "+" : "-";

  return (
    <div
      className="flex items-start justify-between gap-3 border-l-4 pl-3"
      style={{ borderLeftColor: groupingColor ?? "transparent" }}
    >
      <div className="min-w-0">
        {/* Top row: merchant + type chip */}
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">
            {tx.merchant ?? "(No merchant)"}
          </span>

          <span
            className={[
              "rounded-lg border px-2 py-0.5 text-xs font-semibold",
              typeChipClass,
            ].join(" ")}
          >
            {tx.type}
          </span>
        </div>

        {/* Bottom row: date + optional note */}
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-text">
          <span>{formatDate(tx.occurredAt)}</span>

          {tx.note && (
            <>
              <span>•</span>
              <span className="truncate">{tx.note}</span>
            </>
          )}
        </div>

        {tx.plaidAccount && (
          <div className="mt-2 text-xs text-muted-text">
            {tx.plaidAccount.item.institutionName ?? "Connected bank"} ·{" "}
            {tx.plaidAccount.name}
            {tx.plaidAccount.mask ? ` •••• ${tx.plaidAccount.mask}` : ""}
          </div>
        )}
      </div>

      {/* Right side: amount + actions */}
      <div className="shrink-0 text-right">
        <div className={["font-semibold", amountClass].join(" ")}>
          {amountPrefix}
          {formatMoney(tx.amountCents, currency)}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(tx)}
              className="rounded-lg border border-border bg-raised-bg px-2 py-1 text-xs text-muted-text hover:border-border-hover hover:text-primary-text"
            >
              Edit
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(tx.id)}
              className="rounded-lg border border-danger bg-danger-bg px-2 py-1 text-xs text-danger-text hover:opacity-90"
            >
              Delete
            </button>
          )}
        </div>

        {onDetails && (
          <button
            type="button"
            className="mt-2 text-xs text-muted-text hover:text-primary-text"
            onClick={() => onDetails(tx.id)}
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
}
