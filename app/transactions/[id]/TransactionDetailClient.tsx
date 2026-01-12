/**
 * TransactionDetailClient Component
 *
 * Client-side component that displays a single transaction's details.
 * This component handles:
 * - Displaying all transaction information in a readable format
 * - Edit functionality (opens modal)
 * - Delete functionality (with confirmation)
 * - Navigation back to the transactions list
 *
 * This is a client component ("use client") because it uses:
 * - React hooks (useState, useRouter)
 * - Event handlers (onClick)
 * - Interactive UI elements
 */

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Transaction } from "@/src/shared/validators/transactions";
import { formatMoney, formatDate } from "@/src/shared/utils/format";
import TransactionModal from "../TransactionModal";

/**
 * Props Type
 *
 * @property transaction - The transaction object to display
 */
type Props = {
  transaction: Transaction;
};

/**
 * TransactionDetailClient Component
 *
 * Main component that renders the transaction detail view.
 *
 * @param transaction - The transaction data to display
 * @returns JSX element containing the full detail page UI
 */
export default function TransactionDetailClient({ transaction }: Props) {
  // ==================== HOOKS ====================

  /**
   * router - Next.js router for navigation
   * Used to navigate back to the list or redirect after delete
   */
  const router = useRouter();

  /**
   * isEditModalOpen - Controls visibility of the edit modal
   * When true, the TransactionModal opens in edit mode
   */
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  /**
   * isDeleting - Loading state for delete operation
   * Prevents multiple delete requests and shows loading state
   */
  const [isDeleting, setIsDeleting] = useState(false);

  // ==================== EVENT HANDLERS ====================

  /**
   * handleDelete - Deletes the current transaction
   *
   * This function:
   * 1. Confirms deletion with user (native browser confirm dialog)
   * 2. Sends DELETE request to API
   * 3. Redirects to transactions list on success
   * 4. Shows error alert on failure
   *
   * Uses async/await because it makes an API call.
   */
  async function handleDelete() {
    // Show confirmation dialog - if user cancels, exit early
    const ok = window.confirm("Delete this transaction?");
    if (!ok) return;

    try {
      setIsDeleting(true); // Show loading state

      // Send DELETE request to the API
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
        credentials: "include", // Include authentication cookies
      });

      // Check if request was successful
      if (!res.ok) {
        // Try to get error message from response
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete transaction");
      }

      // Success! Redirect back to transactions list
      // The deleted transaction will no longer appear in the list
      router.push("/transactions");
    } catch (error) {
      // Handle errors - log for debugging and show user-friendly message
      console.error("Delete error:", error);
      alert(
        error instanceof Error ? error.message : "Failed to delete transaction"
      );
    } finally {
      // Always clear loading state, even if there was an error
      setIsDeleting(false);
    }
  }

  // ==================== FORMATTED VALUES ====================

  /**
   * fullDate - Formatted date string for display
   * Example: "Monday, January 15, 2024"
   * Includes weekday, full month name, day, and year
   */
  const fullDate = new Date(transaction.occurredAt).toLocaleDateString(
    "en-US",
    {
      weekday: "long", // "Monday", "Tuesday", etc.
      year: "numeric", // "2024"
      month: "long", // "January", "February", etc.
      day: "numeric", // "15"
    }
  );

  /**
   * fullDateTime - Formatted date and time string
   * Example: "January 15, 2024 at 3:45 PM"
   * Includes date and time for more precise information
   */
  const fullDateTime = new Date(transaction.occurredAt).toLocaleString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric", // 12-hour format
      minute: "2-digit", // Always 2 digits (e.g., "05" not "5")
    }
  );

  // ==================== RENDER ====================

  return (
    <main className="min-h-screen bg-primary-bg text-primary-text px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* Header Section - Back button and page title */}
        <div className="flex items-center gap-4">
          {/* Back Button - Returns to previous page (usually transactions list) */}
          <button
            type="button"
            onClick={() => router.back()} // Navigate to previous page in browser history
            className="rounded-xl border border-border bg-raised-bg px-4 py-2 text-sm font-semibold text-primary-text hover:border-border-hover"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transaction Details
          </h1>
        </div>

        {/* Transaction Details Card - Main content area */}
        <div className="rounded-card border border-border bg-surface-bg p-6 space-y-6">
          {/* Amount Section - Large, prominent display */}
          {/* Shows amount with color coding: red for expenses, green for income */}
          <div className="text-center pb-6 border-b border-border">
            <div className="text-sm text-muted-text mb-2">Amount</div>
            {/* Large amount display with conditional styling */}
            <div
              className={`text-4xl font-bold ${
                transaction.type === "EXPENSE"
                  ? "text-danger-text" // Red for expenses
                  : "text-green-600" // Green for income
              }`}
            >
              {/* Show minus sign for expenses, plus for income */}
              {transaction.type === "EXPENSE" ? "-" : "+"}
              {formatMoney(transaction.amountCents, "USD")}
            </div>
            {/* Transaction type badge */}
            <div className="mt-2">
              <span className="rounded-lg border border-border bg-raised-bg px-3 py-1 text-sm font-semibold text-muted-text">
                {transaction.type}
              </span>
            </div>
          </div>

          {/* Details Section - All transaction information */}
          <div className="space-y-4">
            {/* Merchant Field */}
            <div>
              <div className="text-xs font-medium text-muted-text mb-1">
                Merchant
              </div>
              {/* Show merchant name or placeholder if not set */}
              <div className="text-lg font-semibold">
                {transaction.merchant || "(No merchant)"}
              </div>
            </div>

            {/* Date Field - Shows both full date and date+time */}
            <div>
              <div className="text-xs font-medium text-muted-text mb-1">
                Date
              </div>
              {/* Full date: "Monday, January 15, 2024" */}
              <div className="text-lg">{fullDate}</div>
              {/* Date with time: "January 15, 2024 at 3:45 PM" */}
              <div className="text-sm text-muted-text mt-1">{fullDateTime}</div>
            </div>

            {/* Note Field - Only shown if note exists */}
            {/* Conditional rendering: only render if transaction has a note */}
            {transaction.note && (
              <div>
                <div className="text-xs font-medium text-muted-text mb-1">
                  Note
                </div>
                {/* whitespace-pre-wrap preserves line breaks in the note */}
                <div className="text-lg whitespace-pre-wrap">
                  {transaction.note}
                </div>
              </div>
            )}

            {/* Transaction ID - For reference/debugging */}
            <div>
              <div className="text-xs font-medium text-muted-text mb-1">
                Transaction ID
              </div>
              {/* Display the database ID for reference */}
              <div className="text-sm text-muted-text">#{transaction.id}</div>
            </div>
          </div>

          {/* Action Buttons Section - Edit and Delete */}
          <div className="flex gap-3 pt-4 border-t border-border">
            {/* Edit Button - Opens the edit modal */}
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)} // Open modal in edit mode
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:opacity-90"
            >
              Edit Transaction
            </button>

            {/* Delete Button - Deletes the transaction with confirmation */}
            <button
              type="button"
              onClick={handleDelete} // Calls the delete handler
              disabled={isDeleting} // Disable while deleting to prevent double-clicks
              className="flex-1 rounded-xl border border-danger bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text hover:opacity-90 disabled:opacity-50"
            >
              {/* Show loading text while deleting */}
              {isDeleting ? "Deleting..." : "Delete Transaction"}
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal - Reuses the TransactionModal component */}
      {/* When isOpen is true, the modal appears with the transaction data pre-filled */}
      <TransactionModal
        isOpen={isEditModalOpen} // Controls modal visibility
        onClose={() => setIsEditModalOpen(false)} // Close handler
        defaultType={transaction.type} // Pre-select the transaction type
        transaction={transaction} // Pre-fill with current transaction data
        onSaved={() => {
          // After successful save:
          setIsEditModalOpen(false); // Close the modal
          router.refresh(); // Refresh the page to show updated data
          // router.refresh() tells Next.js to re-fetch data from the server
        }}
      />
    </main>
  );
}
