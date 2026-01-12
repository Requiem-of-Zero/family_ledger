/**
 * Format cents into localized currency string
 * Example: 123456 -> "$1,234.56"
 */
export function formatMoney(amountCents: number, currency: string) {
  const amount = amountCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Format ISO date string or Date into readable date
 */
export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
