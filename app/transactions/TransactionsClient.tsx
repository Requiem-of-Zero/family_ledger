/**
 * TransactionsClient Component
 *
 * Main client-side component for the transactions page. Handles:
 * - Fetching transactions from the API with filters (type, date range)
 * - Displaying transactions in a list
 * - Filtering and searching transactions
 * - Managing transaction CRUD operations (create, update, delete)
 * - URL state management for shareable/bookmarkable filters
 *
 * Features:
 * - Type filtering (EXPENSE, INCOME, or all)
 * - Date range filtering (custom or presets: 7/30/90 days, all time)
 * - Search by merchant or note
 * - Transaction chart visualization
 * - Modal for adding/editing transactions
 * - URL-synced filters (shareable links)
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TransactionListResponseSchema,
  Transaction,
  TransactionType,
} from "@/src/shared/validators/transactions";
import TransactionRow from "./TransactionRow";
import TransactionModal from "./TransactionModal";
import TransactionsChart from "./TransactionChart";
import { formatMoney } from "@/src/shared/utils/format";

export default function TransactionsClient() {
  // ==================== STATE MANAGEMENT ====================

  /**
   * items - Array of all transactions fetched from the API
   * Updated when filters change or when transactions are created/updated/deleted
   */
  const [items, setItems] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * query - Search query string
   * Used for client-side filtering by merchant or note
   */
  const [query, setQuery] = useState("");

  /**
   * isModalOpen - Controls visibility of the add/edit transaction modal
   */
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * editingTx - Currently editing transaction (null when adding new)
   * When set, the modal opens in edit mode with this transaction's data
   */
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  /**
   * reloadKey - Force refresh trigger
   * Incrementing this value causes the useEffect to refetch data
   * Used after create/update/delete operations
   */
  const [reloadKey, setReloadKey] = useState(0);

  // ==================== NEXT.JS NAVIGATION HOOKS ====================

  /**
   * router - Next.js router for programmatic navigation
   * Used to update URL query parameters without page reload
   */
  const router = useRouter();

  /**
   * pathname - Current route path (e.g., "/transactions")
   * Used when constructing new URLs with query parameters
   */
  const pathname = usePathname();

  /**
   * searchParams - URL query parameters (read-only)
   * Used to read current filter values from the URL
   * Example: ?type=expense&from=2024-01-01&to=2024-01-31
   */
  const searchParams = useSearchParams();

  // ==================== URL QUERY PARAMETER PARSING ====================

  /**
   * Parse filter values from URL query parameters
   * This allows filters to be shareable via URL links
   */
  const urlTypeRaw = searchParams.get("type");
  const urlFromDateRaw = searchParams.get("from");
  const urlToDateRaw = searchParams.get("to");

  /**
   * fromDate / toDate - Date range filter state
   * Stored as ISO date strings (YYYY-MM-DD format) for HTML date inputs
   * Empty string means "no filter" (show all time)
   * Initialized from URL params on component mount
   */
  const [fromDate, setFromDate] = useState<string>(urlFromDateRaw || "");
  const [toDate, setToDate] = useState<string>(urlToDateRaw || "");

  /**
   * typeFilter - Parsed transaction type filter
   * Validates and normalizes the URL type parameter
   * Returns "EXPENSE", "INCOME", or null (show all)
   */
  const typeFilter: TransactionType | null =
    urlTypeRaw &&
    (urlTypeRaw.toUpperCase() === "EXPENSE" ||
      urlTypeRaw.toUpperCase() === "INCOME")
      ? (urlTypeRaw.toUpperCase() as TransactionType)
      : null;

  // ==================== COMPUTED UI VALUES ====================

  /**
   * pageTitle - Dynamic page title based on current filter
   * Changes to "Expenses", "Income", or "Transactions" based on typeFilter
   */
  const pageTitle =
    typeFilter === "EXPENSE"
      ? "Expenses"
      : typeFilter === "INCOME"
      ? "Income"
      : "Transactions";

  /**
   * pageSubtitle - Dynamic subtitle text
   * Provides context about what's being displayed
   */
  const pageSubtitle =
    typeFilter === "EXPENSE"
      ? "All outgoing money."
      : typeFilter === "INCOME"
      ? "All incoming money"
      : "Track spending and keep your ledger clean.";
  // ==================== URL UPDATE FUNCTIONS ====================

  /**
   * updateTypeInUrl - Updates the transaction type filter in the URL
   *
   * This function:
   * 1. Preserves existing query parameters (dates, etc.)
   * 2. Updates or removes the "type" parameter
   * 3. Updates the browser URL without page reload
   *
   * @param type - Transaction type to filter by ("EXPENSE", "INCOME", or null for all)
   *
   * Example: updateTypeInUrl("EXPENSE") → URL becomes ?type=expense
   *          updateTypeInUrl(null) → URL has type parameter removed
   */
  function updateTypeInUrl(type: TransactionType | null) {
    // Clone existing params to preserve other filters (from/to/familyId)
    const params = new URLSearchParams(searchParams.toString());

    // Add or remove the type parameter
    // null means "show all", so we delete the parameter
    type === null ? params.delete("type") : params.set("type", type);
    const searchParamString = params.toString();

    // Update URL - this triggers the component to refetch data
    router.push(
      searchParamString
        ? `${pathname}?${searchParamString.toLowerCase()}`
        : pathname
    );
  }

  /**
   * updateDatesInUrl - Updates the date range filters in the URL
   *
   * This function:
   * 1. Preserves existing query parameters (type, etc.)
   * 2. Updates or removes the "from" and "to" parameters
   * 3. Updates the browser URL without page reload
   *
   * @param from - Start date in ISO format (YYYY-MM-DD) or empty string for no filter
   * @param to - End date in ISO format (YYYY-MM-DD) or empty string for no filter
   *
   * Example: updateDatesInUrl("2024-01-01", "2024-01-31") → URL becomes ?from=2024-01-01&to=2024-01-31
   */
  function updateDatesInUrl(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());

    // Add or remove date parameters (empty string = no filter)
    if (from) params.set("from", from);
    else params.delete("from");

    if (to) params.set("to", to);
    else params.delete("to");

    const searchParamString = params.toString();
    router.push(
      searchParamString ? `${pathname}?${searchParamString}` : pathname
    );
  }

  /**
   * setDatePreset - Quick date range preset function
   *
   * Convenience function to set common date ranges:
   * - "7d" = Last 7 days from today
   * - "30d" = Last 30 days from today
   * - "90d" = Last 90 days from today
   * - "all" = Remove date filters (show all time)
   *
   * Calculates dates, updates state, and syncs to URL.
   *
   * @param preset - Preset identifier ("7d" | "30d" | "90d" | "all")
   */
  function setDatePreset(preset: "7d" | "30d" | "90d" | "all") {
    if (preset === "all") {
      // Clear date filters
      setFromDate("");
      setToDate("");
      updateDatesInUrl("", "");
      return;
    }

    // Calculate date range: X days ago to today
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const to = new Date(); // Today
    const from = new Date();
    from.setDate(from.getDate() - days); // X days ago

    // Convert to ISO date strings (YYYY-MM-DD)
    const fromStr = from.toISOString().split("T")[0];
    const toStr = to.toISOString().split("T")[0];

    // Update state and URL
    setFromDate(fromStr);
    setToDate(toStr);
    updateDatesInUrl(fromStr, toStr);
  }

  // ==================== DATA FETCHING (useEffect) ====================

  /**
   * useEffect - Fetches transactions from the API
   *
   * This effect runs:
   * - On component mount (initial load)
   * - When typeFilter changes (user selects All/Expense/Income)
   * - When fromDate changes (user changes start date)
   * - When toDate changes (user changes end date)
   * - When reloadKey changes (after create/update/delete operations)
   *
   * The cancelled flag prevents state updates if the component unmounts
   * during the async operation (prevents memory leaks and warnings).
   */
  useEffect(() => {
    let cancelled = false; // Flag to prevent state updates after unmount

    /**
     * load - Async function that fetches transactions from the API
     *
     * Process:
     * 1. Build query parameters from current filters
     * 2. Fetch from API with filters
     * 3. Validate response with Zod schema
     * 4. Update state with transactions
     */
    async function load() {
      try {
        setIsLoading(true); // Show loading indicator
        setError(null); // Clear any previous errors

        // Build query parameters for the API request
        // Only include parameters that have values
        const params = new URLSearchParams();
        if (typeFilter) params.set("type", typeFilter); // Filter by transaction type
        if (fromDate) params.set("from", fromDate); // Filter by start date
        if (toDate) params.set("to", toDate); // Filter by end date

        // Fetch transactions from the API route
        // credentials: "include" sends cookies for authentication
        const res = await fetch(
          `/api/transactions?${params.toString()}`,
          {
            method: "GET",
            credentials: "include", // Include authentication cookies
          }
        );

        // Parse the JSON response body
        // If parsing fails, default to empty object (handled below)
        const body = await res.json().catch(() => ({}));

        // Check if the API request was successful
        if (!res.ok) {
          // Extract error message from response or use default
          const msg =
            typeof (body as any)?.error === "string"
              ? (body as any).error
              : "Failed to load transactions.";
          throw new Error(msg);
        }

        // Validate the response structure using Zod schema
        // This ensures type safety and catches API contract violations
        const parsedBody = TransactionListResponseSchema.parse(body);

        // Only update state if component is still mounted
        if (!cancelled) setItems(parsedBody.transactions);
      } catch (error) {
        // Handle both network errors and Zod validation errors
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to load transactions."
          );
          setItems([]); // Clear transactions on error
        }
      } finally {
        // Always clear loading state unless component unmounted
        if (!cancelled) setIsLoading(false);
      }
    }

    load(); // Execute the fetch function
  }, [typeFilter, reloadKey, fromDate, toDate]); // Re-run when these values change

  // ==================== COMPUTED VALUES (useMemo) ====================

  /**
   * filtered - Client-side search filtering
   *
   * This useMemo hook filters the transactions array based on the search query.
   * It only recalculates when 'items' or 'query' changes, improving performance.
   *
   * Filtering logic:
   * - Searches in transaction merchant name (case-insensitive)
   * - Searches in transaction note/description (case-insensitive)
   * - Returns all items if query is empty
   *
   * Note: This is client-side filtering. API already filters by type and date.
   */
  const filtered = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    // If no search term, return all items (no client-side filtering needed)
    if (!searchTerm) return items;

    // Filter transactions that match the search term in merchant or note
    return items.filter((tx) => {
      const merchant = (tx.merchant ?? "").toLowerCase();
      const note = (tx.note ?? "").toLowerCase();
      // Return true if search term is found in either merchant or note
      return merchant.includes(searchTerm) || note.includes(searchTerm);
    });
  }, [items, query]); // Recalculate when transactions or search query changes

  /**
   * totalCents - Sum of all filtered transaction amounts
   *
   * Calculates the total monetary value of all currently filtered transactions.
   * Stored in cents (integers) for precision, then formatted for display.
   *
   * Uses useMemo to avoid recalculating on every render - only recalculates
   * when the filtered array changes.
   */
  const totalCents = useMemo(() => {
    // Sum all transaction amounts (in cents)
    // Note: Expenses are positive in the data, so we might want to negate them
    // depending on how you want to display totals
    let sum = 0;

    for (let i = 0; i < filtered.length; i++) {
      filtered[i].type === "INCOME"
        ? (sum += filtered[i].amountCents)
        : (sum -= filtered[i].amountCents);
    }

    return sum;
  }, [filtered]); // Recalculate when filtered transactions change

  // ==================== EVENT HANDLERS ====================

  /**
   * handleDelete - Deletes a transaction
   *
   * This function:
   * 1. Confirms deletion with user (native browser confirm dialog)
   * 2. Sends DELETE request to API
   * 3. Refreshes the transaction list on success
   * 4. Shows error message on failure
   *
   * @param id - The ID of the transaction to delete
   */
  async function handleDelete(id: number) {
    // Show confirmation dialog - if user cancels, exit early
    const ok = window.confirm("Delete this transaction?");
    if (!ok) return;

    try {
      setError(null); // Clear any previous errors

      // Send DELETE request to the API
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
        credentials: "include", // Include authentication cookies
      });

      // Parse response (default to empty object if parsing fails)
      const body = await res.json().catch(() => ({}));

      // Check if request was successful
      if (!res.ok) {
        const msg =
          typeof body?.error === "string"
            ? body.error
            : "Failed to delete transaction.";
        throw new Error(msg);
      }

      // Trigger refetch by incrementing reloadKey
      // This causes the useEffect to run again and fetch updated data
      setReloadKey((k) => k + 1);
    } catch (error) {
      // Display error message to user
      setError(
        error instanceof Error ? error.message : "Failed to delete transaction."
      );
    }
  }

  // ==================== RENDER ====================

  return (
    <main className="min-h-screen bg-primary-bg text-primary-text px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* Header Section - Page title and Add button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {pageTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-text">{pageSubtitle}</p>
          </div>

          {/* Add Transaction Button - Opens modal in "add" mode */}
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
            onClick={() => {
              setEditingTx(null); // Clear editing transaction (we're adding new)
              setIsModalOpen(true); // Open the modal
            }}
          >
            Add
          </button>
        </div>

        {/* Transaction Chart - Visual representation of transaction trends */}
        <TransactionsChart transactions={filtered} typeFilter={typeFilter} />

        {/* Filters Card - Contains all filtering controls */}
        <div className="rounded-card border border-border bg-surface-bg p-4">
          {/* Date Range Filters Section */}
          <div className="mb-4 space-y-3">
            {/* Quick Date Preset Buttons - Convenient shortcuts for common ranges */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-muted-text">Date Range:</span>
              <button
                type="button"
                onClick={() => setDatePreset("7d")}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-raised-bg hover:bg-primary hover:text-primary-fg transition"
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("30d")}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-raised-bg hover:bg-primary hover:text-primary-fg transition"
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("90d")}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-raised-bg hover:bg-primary hover:text-primary-fg transition"
              >
                Last 90 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("all")}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-raised-bg hover:bg-primary hover:text-primary-fg transition"
              >
                All time
              </button>
            </div>

            {/* Custom Date Range Inputs - Manual date selection */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-text">
                  From
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value); // Update local state
                    updateDatesInUrl(e.target.value, toDate); // Sync to URL
                  }}
                  className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-text">
                  To
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value); // Update local state
                    updateDatesInUrl(fromDate, e.target.value); // Sync to URL
                  }}
                  className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
                />
              </div>
            </div>
          </div>

          {/* Search and Type Filter Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input - Client-side filtering by merchant/note */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search merchant or note..."
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
            />

            {/* Type Filter Segmented Control - Filter by transaction type */}
            <div className="grid w-full grid-cols-3 rounded-xl border border-border bg-raised-bg p-1 sm:max-w-[320px]">
              <button
                type="button"
                onClick={() => updateTypeInUrl(null)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  typeFilter === null
                    ? "bg-primary text-primary-fg"
                    : "text-muted-text hover:text-primary-text",
                ].join(" ")}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => updateTypeInUrl("EXPENSE")}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  typeFilter === "EXPENSE"
                    ? "bg-primary text-primary-fg"
                    : "text-muted-text hover:text-primary-text",
                ].join(" ")}
              >
                Expense
              </button>

              <button
                type="button"
                onClick={() => updateTypeInUrl("INCOME")}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  typeFilter === "INCOME"
                    ? "bg-primary text-primary-fg"
                    : "text-muted-text hover:text-primary-text",
                ].join(" ")}
              >
                Income
              </button>
            </div>
          </div>

          {/* Summary Row - Shows count and total */}
          <div className="mt-3 flex items-center justify-between text-sm">
            {/* Transaction Count - Shows how many transactions match filters */}
            <span className="text-muted-text">
              {isLoading ? "Loading…" : `${filtered.length} shown`}
            </span>

            {/* Total Amount - Sum of all filtered transactions */}
            <span className="font-semibold">
              Total: {formatMoney(totalCents, "USD")}
            </span>
          </div>

          {/* Error Display - Shows API errors or validation errors */}
          {error && (
            <div className="mt-3 rounded-xl border border-danger bg-danger-bg px-4 py-3 text-sm text-danger-text">
              {error}
            </div>
          )}
        </div>

        {/* Transaction List Card - Displays the actual transaction rows */}
        <div className="rounded-card border border-border bg-surface-bg">
          {isLoading ? (
            // Loading State - Show while fetching data
            <div className="p-4 text-sm text-muted-text">
              Loading transactions…
            </div>
          ) : filtered.length === 0 ? (
            // Empty State - No transactions match the filters
            <div className="p-4 text-sm text-muted-text">
              No transactions match your filters.
            </div>
          ) : (
            // Transaction List - Render each transaction as a row
            <ul className="divide-y divide-border">
              {filtered.map((tx) => (
                <li key={tx.id} className="p-4 hover:bg-raised-bg">
                  <TransactionRow
                    tx={tx}
                    onDetails={(id) => router.push(`/transactions/${id}`)}
                    onEdit={(tx) => {
                      // Set the transaction to edit and open modal
                      setEditingTx(tx);
                      setIsModalOpen(true);
                    }}
                    onDelete={(id) => handleDelete(id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Development Note - TODO items (can be removed in production) */}
        <p className="text-xs text-muted-text">
          Next: hook up from/to dates, familyId, pagination, and Add/Edit flows.
        </p>
      </div>

      {/* Transaction Modal - For adding/editing transactions */}
      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultType={typeFilter ?? "EXPENSE"} // Default to current filter or EXPENSE
        transaction={editingTx} // null = add mode, Transaction = edit mode
        onSaved={() => setReloadKey((key) => key + 1)} // Refresh list after save
      />
    </main>
  );
}
