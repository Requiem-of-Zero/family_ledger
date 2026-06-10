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

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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

const NO_SOURCES_PARAM = "none";
const CATEGORY_COLOR_STORAGE_KEY = "family-ledger:transaction-category-colors";

const DEFAULT_GROUPING_COLORS = {
  MANUAL: "#94a3b8",
  BANK: "#38bdf8",
  PERSONAL: "#94a3b8",
  FAMILY: "#1d4ed8",
  FRIEND_GROUP: "#0f766e",
  SPECIFIC_USERS: "#9333ea",
  CUSTOM: "#ec4899",
} as const;

const LEDGER_LINE_COLORS = {
  expense: "#ef4444",
  income: "#22c55e",
  net: "#eab308",
} as const;

const COMPARE_SERIES_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#f97316",
  "#14b8a6",
  "#f472b6",
  "#84cc16",
  "#fb7185",
  "#22d3ee",
  "#c084fc",
  "#f59e0b",
  "#60a5fa",
  "#34d399",
  "#f43f5e",
  "#d946ef",
  "#2dd4bf",
  "#fde047",
  "#818cf8",
  "#fb923c",
  "#4ade80",
  "#e879f9",
] as const;

type GroupingColorKey = keyof typeof DEFAULT_GROUPING_COLORS;

type PlaidAccountSource = {
  id: number;
  name: string;
  mask?: string | null;
  item: {
    institutionName?: string | null;
  };
};

type FamilySource = {
  id: number;
  name: string;
};

type FriendGroupSource = {
  id: number;
  name: string;
};

type SourceOption = {
  value: string;
  label: string;
};

type SourceOptionGroup = {
  label: string;
  color: string;
  colorKey: GroupingColorKey;
  totalSourceIds: string[];
  options: SourceOption[];
};

export default function TransactionsClient() {
  // ==================== STATE MANAGEMENT ====================

  /**
   * items - Array of all transactions fetched from the API
   * Updated when filters change or when transactions are created/updated/deleted
   */
  const [items, setItems] = useState<Transaction[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidAccountSource[]>([]);
  const [families, setFamilies] = useState<FamilySource[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroupSource[]>([]);
  const [categoryColorOverrides, setCategoryColorOverrides] = useState<
    Partial<Record<GroupingColorKey, string>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * query - Search query string
   * Used for client-side filtering by merchant or note
   */
  const [query, setQuery] = useState("");

  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [chartMode, setChartMode] = useState<"ledger" | "compare">("ledger");
  const sourceDropdownRef = useRef<HTMLDivElement | null>(null);

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
  const selectedSourceParamIds = useMemo(
    () => searchParams.getAll("source"),
    [searchParams],
  );

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
    if (type === null) {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    const searchParamString = params.toString();

    // Update URL - this triggers the component to refetch data
    router.replace(
      searchParamString
        ? `${pathname}?${searchParamString.toLowerCase()}`
        : pathname,
      { scroll: false },
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
    router.replace(
      searchParamString ? `${pathname}?${searchParamString}` : pathname,
      { scroll: false },
    );
  }

  function updateSourcesInUrl(sourceIds: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("source");

    const nextSourceIds =
      sourceIds.length === 0 ? [NO_SOURCES_PARAM] : sourceIds;

    for (const sourceId of nextSourceIds) {
      params.append("source", sourceId);
    }

    const searchParamString = params.toString();
    router.replace(
      searchParamString ? `${pathname}?${searchParamString}` : pathname,
      { scroll: false },
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

  function getPresetRange(days: 7 | 30 | 90) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    return {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    };
  }

  const activeDatePreset = useMemo(() => {
    if (!fromDate && !toDate) return "all";

    const ranges = {
      "7d": getPresetRange(7),
      "30d": getPresetRange(30),
      "90d": getPresetRange(90),
    };

    return (
      (Object.entries(ranges).find(
        ([, range]) => range.from === fromDate && range.to === toDate,
      )?.[0] as "7d" | "30d" | "90d" | undefined) ?? null
    );
  }, [fromDate, toDate]);

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
        const res = await fetch(`/api/transactions?${params.toString()}`, {
          method: "GET",
          credentials: "include", // Include authentication cookies
        });

        // Parse the JSON response body
        // If parsing fails, default to empty object (handled below)
        const body: unknown = await res.json().catch(() => ({}));

        // Check if the API request was successful
        if (!res.ok) {
          // Extract error message from response or use default
          const errorMessage =
            body && typeof body === "object" && "error" in body
              ? body.error
              : null;
          const msg =
            typeof errorMessage === "string"
              ? errorMessage
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
              : "Failed to load transactions.",
          );
          setItems([]); // Clear transactions on error
        }
      } finally {
        // Always clear loading state unless component unmounted
        if (!cancelled) setIsLoading(false);
      }
    }

    load(); // Execute the fetch function

    return () => {
      cancelled = true;
    };
  }, [typeFilter, reloadKey, fromDate, toDate]); // Re-run when these values change

  useEffect(() => {
    let cancelled = false;

    async function loadFilterSources() {
      try {
        const [accountsRes, familiesRes, friendGroupsRes] = await Promise.all([
          fetch("/api/plaid/accounts", {
            method: "GET",
            credentials: "include",
          }),
          fetch("/api/families", {
            method: "GET",
            credentials: "include",
          }),
          fetch("/api/friend-groups", {
            method: "GET",
            credentials: "include",
          }),
        ]);

        const accountsBody: unknown = await accountsRes
          .json()
          .catch(() => ({}));
        const familiesBody: unknown = await familiesRes
          .json()
          .catch(() => ({}));
        const friendGroupsBody: unknown = await friendGroupsRes
          .json()
          .catch(() => ({}));

        if (
          accountsRes.ok &&
          accountsBody &&
          typeof accountsBody === "object" &&
          "accounts" in accountsBody &&
          Array.isArray(accountsBody.accounts) &&
          !cancelled
        ) {
          setPlaidAccounts(accountsBody.accounts as PlaidAccountSource[]);
        }

        if (
          familiesRes.ok &&
          familiesBody &&
          typeof familiesBody === "object" &&
          "families" in familiesBody &&
          Array.isArray(familiesBody.families) &&
          !cancelled
        ) {
          setFamilies(familiesBody.families as FamilySource[]);
        }

        if (
          friendGroupsRes.ok &&
          friendGroupsBody &&
          typeof friendGroupsBody === "object" &&
          "friendGroups" in friendGroupsBody &&
          Array.isArray(friendGroupsBody.friendGroups) &&
          !cancelled
        ) {
          setFriendGroups(friendGroupsBody.friendGroups as FriendGroupSource[]);
        }
      } catch (error) {
        console.error("Failed to load transaction filter sources:", error);
      }
    }

    loadFilterSources();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(CATEGORY_COLOR_STORAGE_KEY);
      if (!rawValue) return;

      const parsedValue = JSON.parse(rawValue);
      if (parsedValue && typeof parsedValue === "object") {
        queueMicrotask(() => {
          setCategoryColorOverrides(
            parsedValue as Partial<Record<GroupingColorKey, string>>,
          );
        });
      }
    } catch (error) {
      console.error("Failed to load category colors:", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CATEGORY_COLOR_STORAGE_KEY,
        JSON.stringify(categoryColorOverrides),
      );
    } catch (error) {
      console.error("Failed to save category colors:", error);
    }
  }, [categoryColorOverrides]);

  useEffect(() => {
    if (!isSourceDropdownOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const dropdown = sourceDropdownRef.current;
      const target = event.target;

      if (!(target instanceof Node)) return;
      if (dropdown?.contains(target)) return;

      setIsSourceDropdownOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSourceDropdownOpen]);

  // ==================== COMPUTED VALUES (useMemo) ====================

  const getCategoryColor = useCallback(
    (colorKey: GroupingColorKey) => {
      return categoryColorOverrides[colorKey] ?? DEFAULT_GROUPING_COLORS[colorKey];
    },
    [categoryColorOverrides],
  );

  const accountOptions = useMemo(() => {
    return plaidAccounts.map((account) => {
      const institution = account.item.institutionName ?? "Connected bank";
      const mask = account.mask ? ` •••• ${account.mask}` : "";

      return {
        value: `plaid:${account.id}`,
        label: `${institution} · ${account.name}${mask}`,
      };
    });
  }, [plaidAccounts]);

  const manualSourceOption = useMemo<SourceOption>(
    () => ({
      value: "manual",
      label: "Manual entries",
    }),
    [],
  );

  const sharedSourceOption = useMemo<SourceOption>(
    () => ({
      value: "shared",
      label: "All shared",
    }),
    [],
  );

  const familySourceOptions = useMemo<SourceOption[]>(
    () =>
      families.map((family) => ({
        value: `family:${family.id}`,
        label: family.name,
      })),
    [families],
  );

  const friendGroupSourceOptions = useMemo<SourceOption[]>(
    () =>
      friendGroups.map((group) => ({
        value: `friend-group:${group.id}`,
        label: group.name,
      })),
    [friendGroups],
  );

  // The source dropdown is now one combined filter surface. Bank/manual options
  // match where the transaction came from, while family/group options match the
  // transaction's sharing scope.
  const groupedSourceOptions = useMemo<SourceOptionGroup[]>(
    () => [
      {
        label: "Manual entries",
        color: getCategoryColor("MANUAL"),
        colorKey: "MANUAL",
        totalSourceIds: ["manual"],
        options: [manualSourceOption],
      },
      {
        label: "Bank connections",
        color: getCategoryColor("BANK"),
        colorKey: "BANK",
        totalSourceIds: accountOptions.map((option) => option.value),
        options: accountOptions,
      },
      {
        label: "Shared",
        color: getCategoryColor("SPECIFIC_USERS"),
        colorKey: "SPECIFIC_USERS",
        totalSourceIds: ["shared"],
        options: [sharedSourceOption],
      },
      {
        label: "Families",
        color: getCategoryColor("FAMILY"),
        colorKey: "FAMILY",
        totalSourceIds: familySourceOptions.map((option) => option.value),
        options: familySourceOptions,
      },
      {
        label: "Friend groups",
        color: getCategoryColor("FRIEND_GROUP"),
        colorKey: "FRIEND_GROUP",
        totalSourceIds: friendGroupSourceOptions.map((option) => option.value),
        options: friendGroupSourceOptions,
      },
    ],
    [
      accountOptions,
      familySourceOptions,
      friendGroupSourceOptions,
      getCategoryColor,
      manualSourceOption,
      sharedSourceOption,
    ],
  );

  const combinedSourceOptions = useMemo(
    () => groupedSourceOptions.flatMap((group) => group.options),
    [groupedSourceOptions],
  );

  const allSourceIds = useMemo(
    () => combinedSourceOptions.map((option) => option.value),
    [combinedSourceOptions],
  );

  // Search the source dropdown. Searching "sha/share/shared" reveals shared
  // connection groups, but the internal direct-share source stays hidden.
  const visibleGroupedSourceOptions = useMemo(() => {
    const searchTerm = sourceSearch.trim().toLowerCase();

    if (!searchTerm) return groupedSourceOptions;

    return groupedSourceOptions.map((group) => {
      const groupLabel = group.label.toLowerCase();
      const isSharedConnectionGroup =
        group.label === "Families" || group.label === "Friend groups";
      const isSharedSearch =
        searchTerm.length >= 3 && "shared".startsWith(searchTerm);
      const shouldShowWholeGroup =
        groupLabel.includes(searchTerm) ||
        (isSharedSearch && isSharedConnectionGroup);

      return {
        ...group,
        options: shouldShowWholeGroup
          ? group.options
          : group.options.filter((option) =>
              option.label.toLowerCase().includes(searchTerm),
            ),
      };
    });
  }, [groupedSourceOptions, sourceSearch]);

  const hasSourceSearch = sourceSearch.trim().length > 0;

  const visibleListGroupedSourceOptions = useMemo(
    () =>
      visibleGroupedSourceOptions.filter(
        (group) => group.label !== "Shared",
      ),
    [visibleGroupedSourceOptions],
  );

  const visibleListSourceOptions = useMemo(
    () => visibleListGroupedSourceOptions.flatMap((group) => group.options),
    [visibleListGroupedSourceOptions],
  );

  const visibleSourceIds = useMemo(
    () => visibleListSourceOptions.map((option) => option.value),
    [visibleListSourceOptions],
  );

  // URL state decides the active sources. No source param means the default
  // "all sources" view; the sentinel value represents an intentionally empty set.
  const selectedSourceIds = useMemo(() => {
    if (selectedSourceParamIds.includes(NO_SOURCES_PARAM)) return [];
    if (selectedSourceParamIds.length === 0) return allSourceIds;

    return selectedSourceParamIds.filter((sourceId) =>
      allSourceIds.includes(sourceId),
    );
  }, [allSourceIds, selectedSourceParamIds]);
  const isDefaultAllSources = selectedSourceParamIds.length === 0;

  const selectedSourceIdSet = useMemo(
    () => new Set(selectedSourceIds),
    [selectedSourceIds],
  );

  const sourceOptionByValue = useMemo(() => {
    return new Map(
      combinedSourceOptions.map((option) => [option.value, option] as const),
    );
  }, [combinedSourceOptions]);

  const sourceButtonLabel =
    selectedSourceIds.length === 0
      ? "No sources"
      : selectedSourceIds.length === combinedSourceOptions.length
        ? "All sources selected"
        : selectedSourceIds.length === 1
          ? (combinedSourceOptions.find(
              (option) => option.value === selectedSourceIds[0],
            )?.label ?? "1 source")
          : `${selectedSourceIds.length} sources`;

  // Toggle one source pill and sync the selection back into the URL.
  function toggleSource(sourceId: string) {
    const next = selectedSourceIds.includes(sourceId)
      ? selectedSourceIds.filter((id) => id !== sourceId)
      : [...selectedSourceIds, sourceId];

    updateSourcesInUrl(next);
  }

  // Bulk actions operate on whatever rows are currently visible in the dropdown,
  // so search results can be selected/cleared without touching hidden sources.
  function selectVisibleSources() {
    updateSourcesInUrl(
      Array.from(new Set([...selectedSourceIds, ...visibleSourceIds])),
    );
  }

  function clearVisibleSources() {
    const visibleSourceIdSet = new Set(visibleSourceIds);
    updateSourcesInUrl(
      selectedSourceIds.filter((sourceId) => !visibleSourceIdSet.has(sourceId)),
    );
  }

  // Category colors are broad buckets (manual, bank, family, group), not
  // per-account colors. This keeps the UI personalized without palette overload.
  function updateCategoryColor(colorKey: GroupingColorKey, color: string) {
    setCategoryColorOverrides((currentColors) => ({
      ...currentColors,
      [colorKey]: color,
    }));
  }

  function resetCategoryColor(colorKey: GroupingColorKey) {
    setCategoryColorOverrides((currentColors) => {
      const nextColors = { ...currentColors };
      delete nextColors[colorKey];
      return nextColors;
    });
  }

  // Translate a transaction into every source filter it belongs to. Personal
  // rows map to manual/bank; shared rows map to family/group/direct-share ids.
  const getTransactionSourceIds = useCallback((tx: Transaction) => {
    const sourceId = tx.plaidAccountId
      ? `plaid:${tx.plaidAccountId}`
      : "manual";
    const transactionSourceIds = new Set<string>();
    const isPersonal = tx.visibility === "PERSONAL" && tx.shares.length === 0;

    if (isPersonal) {
      transactionSourceIds.add(sourceId);
      return Array.from(transactionSourceIds);
    }

    if (tx.visibility === "SPECIFIC_USERS" || tx.visibility === "CUSTOM") {
      transactionSourceIds.add("shared");
    }

    if (tx.familyId) transactionSourceIds.add(`family:${tx.familyId}`);
    if (tx.friendGroupId) {
      transactionSourceIds.add(`friend-group:${tx.friendGroupId}`);
    }

    for (const share of tx.shares) {
      if (share.familyId) transactionSourceIds.add(`family:${share.familyId}`);
      if (share.friendGroupId) {
        transactionSourceIds.add(`friend-group:${share.friendGroupId}`);
      }
    }

    return Array.from(transactionSourceIds);
  }, []);

  // Per-source totals power the numbers shown beside each source option.
  const sourceTotals = useMemo(() => {
    const totals = new Map<string, number>();
    const searchTerm = query.trim().toLowerCase();

    for (const tx of items) {
      if (searchTerm) {
        const merchant = (tx.merchant ?? "").toLowerCase();
        const note = (tx.note ?? "").toLowerCase();
        const institution = (
          tx.plaidAccount?.item.institutionName ?? ""
        ).toLowerCase();
        const accountName = (tx.plaidAccount?.name ?? "").toLowerCase();
        const matchesSearch =
          merchant.includes(searchTerm) ||
          note.includes(searchTerm) ||
          institution.includes(searchTerm) ||
          accountName.includes(searchTerm);

        if (!matchesSearch) continue;
      }

      const signedAmount =
        tx.type === "INCOME" ? tx.amountCents : -tx.amountCents;

      for (const sourceId of getTransactionSourceIds(tx)) {
        totals.set(sourceId, (totals.get(sourceId) ?? 0) + signedAmount);
      }
    }

    return totals;
  }, [getTransactionSourceIds, items, query]);

  function getSourceGroupTotal(sourceIds: string[]) {
    return sourceIds.reduce(
      (total, sourceId) => total + (sourceTotals.get(sourceId) ?? 0),
      0,
    );
  }

  // Pick the accent color for each transaction row from its broad source bucket.
  function getTransactionGroupingColor(tx: Transaction) {
    if (tx.visibility === "PERSONAL") {
      return tx.plaidAccountId
        ? getCategoryColor("BANK")
        : getCategoryColor("MANUAL");
    }

    return getCategoryColor(tx.visibility);
  }

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

    // Filter by selected sources first, then by merchant/note search.
    return items.filter((tx) => {
      const transactionSourceIds = getTransactionSourceIds(tx);

      if (
        !isDefaultAllSources &&
        !transactionSourceIds.some((id) => selectedSourceIdSet.has(id))
      ) {
        return false;
      }

      if (!searchTerm) return true;

      const merchant = (tx.merchant ?? "").toLowerCase();
      const note = (tx.note ?? "").toLowerCase();
      const institution = (
        tx.plaidAccount?.item.institutionName ?? ""
      ).toLowerCase();
      const accountName = (tx.plaidAccount?.name ?? "").toLowerCase();

      return (
        merchant.includes(searchTerm) ||
        note.includes(searchTerm) ||
        institution.includes(searchTerm) ||
        accountName.includes(searchTerm)
      );
    });
  }, [
    items,
    query,
    getTransactionSourceIds,
    isDefaultAllSources,
    selectedSourceIdSet,
  ]); // Recalculate when filters/search change

  // Shared-only source selections are treated differently from the default view:
  // they should chart/summarize the selected shared rows instead of personal rows.
  const isSharedOnlySourceSelection = useMemo(() => {
    const personalSourceIds = selectedSourceIds.filter(
      (sourceId) => sourceId === "manual" || sourceId.startsWith("plaid:"),
    );

    return !isDefaultAllSources && personalSourceIds.length === 0;
  }, [isDefaultAllSources, selectedSourceIds]);

  const summaryTransactions = useMemo(() => {
    // Default ledger stays personal-only so shared rows do not inflate normal
    // totals. Shared-only source filters intentionally summarize selected rows.
    if (isSharedOnlySourceSelection) {
      return filtered;
    }

    return filtered.filter(
      (tx) => tx.visibility === "PERSONAL" && tx.shares.length === 0,
    );
  }, [filtered, isSharedOnlySourceSelection]);

  /**
   * totalCents - Sum of the transactions represented by the summary/chart.
   *
   * Personal ledger totals exclude shared rows by default so they do not inflate
   * normal income, expense, and net worth readings.
   */
  const totalCents = useMemo(() => {
    let sum = 0;

    for (let i = 0; i < summaryTransactions.length; i++) {
      if (summaryTransactions[i].type === "INCOME") {
        sum += summaryTransactions[i].amountCents;
      } else {
        sum -= summaryTransactions[i].amountCents;
      }
    }

    return sum;
  }, [summaryTransactions]);

  const totalLabel = isSharedOnlySourceSelection
    ? "Selected total"
    : "Personal total";

  const chartTransactions = summaryTransactions;

  // Compare mode assigns distinct line colors by selected order so several bank
  // accounts do not collapse into the same category color.
  const getCompareSourceColor = useCallback(
    (_sourceId: string, index: number) => {
      // Compare mode needs every selected line to be visually distinct, even
      // when multiple lines belong to the same category like bank accounts.
      return COMPARE_SERIES_COLORS[index % COMPARE_SERIES_COLORS.length];
    },
    [],
  );

  // Build one chart series per selected source for compare mode. Default "all
  // sources" still means every source should be comparable, not an empty chart.
  const compareSourceSeries = useMemo(() => {
    return selectedSourceIds
      .map((sourceId) => sourceOptionByValue.get(sourceId))
      .filter((option): option is SourceOption => Boolean(option))
      .map((option, index) => ({
        id: option.value,
        label: option.label,
        color: getCompareSourceColor(option.value, index),
        transactions: filtered.filter((tx) =>
          getTransactionSourceIds(tx).includes(option.value),
        ),
      }));
  }, [
    filtered,
    getTransactionSourceIds,
    getCompareSourceColor,
    selectedSourceIds,
    sourceOptionByValue,
  ]);

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
        error instanceof Error
          ? error.message
          : "Failed to delete transaction.",
      );
    }
  }

  function datePresetButtonClass(preset: "7d" | "30d" | "90d" | "all") {
    return toggleButtonClass(activeDatePreset === preset, "px-3 py-1.5");
  }

  // Shared visual language for segmented controls and source pills.
  function toggleButtonClass(
    isSelected: boolean,
    sizeClass = "px-3 py-2",
  ) {
    return [
      "inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition sm:text-sm",
      sizeClass,
      isSelected
        ? "border-primary bg-raised-bg text-primary-text shadow-sm"
        : "border-border text-muted-text hover:bg-surface-bg hover:text-primary-text",
    ].join(" ");
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

        <div className="flex items-center justify-end">
          <div className="grid grid-cols-2 rounded-xl border border-border bg-raised-bg p-1">
            <button
              type="button"
              onClick={() => setChartMode("ledger")}
              className={toggleButtonClass(chartMode === "ledger")}
            >
              My ledger
            </button>
            <button
              type="button"
              onClick={() => setChartMode("compare")}
              className={toggleButtonClass(chartMode === "compare")}
            >
              Compare selected
            </button>
          </div>
        </div>

        {/* Transaction Chart - Visual representation of transaction trends */}
          <TransactionsChart
            transactions={chartTransactions}
            typeFilter={typeFilter}
            mode={chartMode}
            compareSeries={compareSourceSeries}
            lineColors={LEDGER_LINE_COLORS}
          />

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
                className={datePresetButtonClass("7d")}
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("30d")}
                className={datePresetButtonClass("30d")}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("90d")}
                className={datePresetButtonClass("90d")}
              >
                Last 90 days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("all")}
                className={datePresetButtonClass("all")}
              >
                All time
              </button>
            </div>

            {/* Custom Date Range Inputs - Manual date selection */}
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <div className="min-w-0">
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
                  className="min-h-10 w-full min-w-0 rounded-xl border border-border bg-raised-bg px-2.5 py-1.5 text-xs outline-none focus:border-border-hover sm:px-3 sm:py-2 sm:text-sm"
                />
              </div>
              <div className="min-w-0">
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
                  className="min-h-10 w-full min-w-0 rounded-xl border border-border bg-raised-bg px-2.5 py-1.5 text-xs outline-none focus:border-border-hover sm:px-3 sm:py-2 sm:text-sm"
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
                className={toggleButtonClass(typeFilter === null)}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => updateTypeInUrl("EXPENSE")}
                className={toggleButtonClass(typeFilter === "EXPENSE")}
              >
                Expense
              </button>

              <button
                type="button"
                onClick={() => updateTypeInUrl("INCOME")}
                className={toggleButtonClass(typeFilter === "INCOME")}
              >
                Income
              </button>
            </div>
          </div>

          {/* Source Filter - Shows which connected bank/account data is visible */}
          <div ref={sourceDropdownRef} className="relative mt-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-muted-text">
              <span>Source</span>
              <span>{combinedSourceOptions.length} available</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSourceDropdownOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-raised-bg px-3 py-2 text-left text-sm text-primary-text hover:border-border-hover"
            >
              <span className="truncate">{sourceButtonLabel}</span>
              <span className="text-muted-text">
                {isSourceDropdownOpen ? "Close" : "Choose"}
              </span>
            </button>

            {isSourceDropdownOpen && (
              <div className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-border bg-surface-bg p-2 shadow-lg">
                <div
                  className="h-72 space-y-2 overflow-y-scroll overscroll-contain pr-1"
                  onWheel={(event) => event.stopPropagation()}
                >
                  <div className="sticky top-0 z-10 mb-2 space-y-2 bg-surface-bg pb-2">
                    <input
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                      placeholder="Search sources..."
                      className="w-full rounded-lg border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={selectVisibleSources}
                        disabled={visibleSourceIds.length === 0}
                        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-text transition hover:bg-surface-bg hover:text-primary-text disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {hasSourceSearch
                          ? `Select list (${visibleSourceIds.length})`
                          : `Select all (${visibleSourceIds.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={clearVisibleSources}
                        disabled={visibleSourceIds.length === 0}
                        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-text transition hover:bg-surface-bg hover:text-primary-text disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {hasSourceSearch
                          ? `Clear list (${visibleSourceIds.length})`
                          : `Clear all (${visibleSourceIds.length})`}
                      </button>
                    </div>
                  </div>
                  {visibleListSourceOptions.length === 0 ? (
                    <div className="rounded-lg border border-border bg-raised-bg px-3 py-2 text-sm text-muted-text">
                      No sources match your search.
                    </div>
                  ) : null}
                  {visibleListGroupedSourceOptions.map((group) =>
                    group.options.length > 0 ? (
                      <div key={group.label} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 px-1 text-xs font-semibold">
                          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-text">
                            {/* Category color is shared by every source in this bucket. */}
                            <input
                              type="color"
                              value={group.color}
                              aria-label={`Choose ${group.label} color`}
                              onChange={(event) =>
                                updateCategoryColor(
                                  group.colorKey,
                                  event.target.value,
                                )
                              }
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                            />
                            {group.label}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => resetCategoryColor(group.colorKey)}
                              className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-muted-text hover:bg-surface-bg hover:text-primary-text"
                            >
                              Reset
                            </button>
                            <span
                              className={[
                                "tabular-nums",
                                getSourceGroupTotal(group.totalSourceIds) < 0
                                  ? "text-red-300"
                                  : "text-emerald-300",
                              ].join(" ")}
                            >
                              {formatMoney(
                                getSourceGroupTotal(group.totalSourceIds),
                                "USD",
                              )}
                            </span>
                          </span>
                        </div>
                        {group.options.map((option) => (
                          <SourceCheckbox
                            key={option.value}
                            label={option.label}
                            totalCents={sourceTotals.get(option.value) ?? 0}
                            checked={selectedSourceIds.includes(option.value)}
                            onChange={() => toggleSource(option.value)}
                          />
                        ))}
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Summary Row - Shows count and total */}
          <div className="mt-3 flex items-center justify-between text-sm">
            {/* Transaction Count - Shows how many transactions match filters */}
            <span className="text-muted-text">
              {isLoading ? "Loading…" : `${filtered.length} shown`}
            </span>

            {/* Total Amount - Sum of all filtered transactions */}
            <span className="font-semibold">
              {totalLabel}: {formatMoney(totalCents, "USD")}
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
            <div className="max-h-[700px] overflow-y-auto rounded-card">
              <ul className="divide-y divide-border">
                {filtered.slice(0, 40).map((tx) => (
                  <li key={tx.id} className="p-4 hover:bg-raised-bg">
                    <TransactionRow
                      tx={tx}
                      groupingColor={getTransactionGroupingColor(tx)}
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
            </div>
          )}
        </div>
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

function SourceCheckbox({
  label,
  totalCents,
  checked,
  onChange,
}: {
  label: string;
  totalCents: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={[
        "flex min-h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
        checked
          ? "border-primary bg-raised-bg text-primary-text shadow-sm"
          : "border-border bg-raised-bg text-muted-text hover:bg-surface-bg hover:text-primary-text",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      <span
        className={[
          "shrink-0 tabular-nums text-xs font-semibold",
          totalCents < 0
              ? "text-red-300"
              : "text-emerald-300",
        ].join(" ")}
      >
        {formatMoney(totalCents, "USD")}
      </span>
    </button>
  );
}
