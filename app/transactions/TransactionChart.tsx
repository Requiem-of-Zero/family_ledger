/**
 * TransactionsChart Component
 *
 * A line chart component that visualizes transaction trends over time.
 * Displays running totals (cumulative sums) of income, expenses, and net value.
 * Supports filtering by transaction type (EXPENSE, INCOME, or all).
 *
 * Features:
 * - Groups transactions by date
 * - Calculates running totals (cumulative sums over time)
 * - Displays different lines based on filter: income (green), expenses (red), or net (yellow)
 * - Responsive chart that adapts to container width
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Transaction,
  TransactionType,
} from "@/src/shared/validators/transactions";
import { formatMoney } from "@/src/shared/utils/format";

/**
 * ChartDataPoint Type
 *
 * Represents a single data point on the chart.
 * All monetary values are stored in cents (integers) for precision.
 *
 * @property date - Formatted date string for display (e.g., "Jan 5")
 * @property amount - The value to display based on current filter (in cents)
 * @property expense - Running total of all expenses up to this date (in cents)
 * @property income - Running total of all income up to this date (in cents)
 */
type ChartDataPoint = {
  date: string;
  amount: number; // in cents
  expense: number;
  income: number;
};

type CompareDataPoint = {
  date: string;
  amount: number;
  expense: number;
  income: number;
  myNet: number;
  [seriesKey: string]: number | string;
};

type CompareSeries = {
  id: string;
  label: string;
  color: string;
  transactions: Transaction[];
};

type TooltipPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  stroke?: string;
  value?: string | number;
};

type CompareTooltipProps = {
  active?: boolean;
  activeKey?: string | null;
  formatCurrency: (value: number) => string;
  hiddenKeys: Set<string>;
  label?: string | number;
  payload?: TooltipPayloadItem[];
};

type CompareLegendItem = {
  key: string;
  label: string;
  color: string;
};

/**
 * Props Type
 *
 * Component input properties
 *
 * @property transactions - Array of all transactions to display
 * @property typeFilter - Filter type: "EXPENSE", "INCOME", or null (show all)
 */
type Props = {
  transactions: Transaction[];
  typeFilter: TransactionType | null;
  mode?: "ledger" | "compare";
  compareSeries?: CompareSeries[];
  lineColors?: {
    expense: string;
    income: string;
    net: string;
  };
};

/**
 * TransactionsChart Component
 *
 * Main component that renders a line chart of transaction data.
 *
 * @param transactions - Array of transaction objects to visualize
 * @param typeFilter - Current filter setting (null = all, "EXPENSE" = expenses only, "INCOME" = income only)
 * @returns JSX element containing the chart
 */
export default function TransactionsChart({
  transactions,
  typeFilter,
  mode = "ledger",
  compareSeries = [],
  lineColors = {
    expense: "#ef4444",
    income: "#22c55e",
    net: "#eab308",
  },
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeCompareKey, setActiveCompareKey] = useState<string | null>(null);
  const [hiddenCompareKeys, setHiddenCompareKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

  const signedAmount = useCallback((tx: Transaction) => {
    return tx.type === "INCOME" ? tx.amountCents : -tx.amountCents;
  }, []);

  /**
   * chartData - Memoized computed chart data
   *
   * Transforms raw transactions into chart-ready data points with running totals.
   * This useMemo hook ensures the expensive calculation only runs when transactions or typeFilter changes.
   *
   * Process:
   * 1. Group transactions by date (calculate daily totals)
   * 2. Sort dates chronologically
   * 3. Calculate running totals (cumulative sums)
   * 4. Format for chart display
   */
  const chartData = useMemo<ChartDataPoint[]>(() => {
    // Step 1: Group transactions by date (YYYY-MM-DD format)
    // Using a Map to efficiently group transactions that occur on the same day
    const grouped = new Map<
      string,
      { expense: number; income: number; dateObj: Date }
    >();

    // Iterate through each transaction and accumulate daily totals
    transactions.forEach((tx) => {
      const txDate = new Date(tx.occurredAt);
      // Use ISO date string (YYYY-MM-DD) as the key for grouping
      // This ensures all transactions on the same calendar day are grouped together
      const dateKey = txDate.toISOString().split("T")[0];

      // Initialize the day's totals if this is the first transaction for this date
      if (!grouped.has(dateKey))
        grouped.set(dateKey, { expense: 0, income: 0, dateObj: txDate });
      // Add this transaction's amount to the appropriate category (expense or income)
      const group = grouped.get(dateKey)!;
      if (tx.type === "EXPENSE") {
        group.expense += tx.amountCents;
      } else {
        group.income += tx.amountCents;
      }
    });

    // Step 2: Convert Map to array and sort by date chronologically
    // This creates an array of days with their daily totals, sorted from earliest to latest
    const sortedDays = Array.from(grouped.entries())
      .map(([isoDate, amounts]) => ({
        dateKey: isoDate, // ISO date string for reference
        date: amounts.dateObj.toLocaleDateString("en-US", {
          // Format date for display: "Jan 5", "Dec 31", etc.
          month: "short",
          day: "numeric",
        }),
        dateSort: amounts.dateObj.getTime(), // Timestamp for sorting
        dailyExpense: amounts.expense, // Total expenses for this day
        dailyIncome: amounts.income, // Total income for this day
      }))
      .sort((a, b) => a.dateSort - b.dateSort); // Sort chronologically (oldest to newest)

    // Step 3: Calculate running totals (cumulative sums)
    // Running totals show the accumulated value from the start date to each point in time
    // Example: If you have $100 on day 1, $50 on day 2, running totals are: [100, 150]
    // Transform sorted days into chart data points with running totals
    return sortedDays.reduce<{
      points: ChartDataPoint[];
      runningIncome: number;
      runningExpense: number;
    }>(
      (state, day) => {
      // Add today's amounts to the running totals
        const runningIncome = state.runningIncome + day.dailyIncome;
        const runningExpense = state.runningExpense + day.dailyExpense;
      // Net = total income - total expenses (can be negative if expenses exceed income)
      const net = runningIncome - runningExpense;

        state.points.push({
          date: day.date, // Display date string
        // The 'amount' field is what gets displayed on the chart
        // It changes based on the current filter setting
          amount:
            typeFilter === "EXPENSE"
              ? runningExpense // Show cumulative expenses
              : typeFilter === "INCOME"
                ? runningIncome // Show cumulative income
                : net, // Show net (income - expenses)
          expense: runningExpense, // Always store running expense total
          income: runningIncome, // Always store running income total
        });

        return {
          points: state.points,
          runningIncome,
          runningExpense,
        };
      },
      { points: [], runningIncome: 0, runningExpense: 0 },
    ).points;
  }, [transactions, typeFilter]); // Recalculate when transactions or filter changes

  const compareData = useMemo<CompareDataPoint[]>(() => {
    const dateMap = new Map<
      string,
      {
        dateObj: Date;
        myNet: number;
        series: Record<string, number>;
      }
    >();

    function addDailyAmount(
      tx: Transaction,
      seriesKey: string | null,
    ) {
      const txDate = new Date(tx.occurredAt);
      const dateKey = txDate.toISOString().split("T")[0];
      const existing = dateMap.get(dateKey) ?? {
        dateObj: txDate,
        myNet: 0,
        series: {},
      };
      const amount = signedAmount(tx);

      dateMap.set(dateKey, {
        dateObj: existing.dateObj,
        myNet: seriesKey ? existing.myNet : existing.myNet + amount,
        series: seriesKey
          ? {
              ...existing.series,
              [seriesKey]: (existing.series[seriesKey] ?? 0) + amount,
            }
          : existing.series,
      });
    }

    for (const tx of transactions) addDailyAmount(tx, null);

    compareSeries.forEach((series, index) => {
      const seriesKey = `series_${index}`;
      for (const tx of series.transactions) addDailyAmount(tx, seriesKey);
    });

    const sortedDays = Array.from(dateMap.entries())
      .map(([dateKey, value]) => ({
        dateKey,
        date: value.dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        dateSort: value.dateObj.getTime(),
        myNet: value.myNet,
        series: value.series,
      }))
      .sort((a, b) => a.dateSort - b.dateSort);

    return sortedDays.reduce<{
      points: CompareDataPoint[];
      runningMyNet: number;
      runningSeries: Record<string, number>;
    }>(
      (state, day) => {
        const runningMyNet = state.runningMyNet + day.myNet;
        const nextRunningSeries = compareSeries.reduce<Record<string, number>>(
          (seriesTotals, _series, index) => {
            const key = `series_${index}`;
            return {
              ...seriesTotals,
              [key]: (state.runningSeries[key] ?? 0) + (day.series[key] ?? 0),
            };
          },
          {},
        );

        state.points.push({
          date: day.date,
          amount: runningMyNet,
          expense: 0,
          income: 0,
          myNet: runningMyNet,
          ...nextRunningSeries,
        });

        return {
          points: state.points,
          runningMyNet,
          runningSeries: nextRunningSeries,
        };
      },
      { points: [], runningMyNet: 0, runningSeries: {} },
    ).points;
  }, [compareSeries, signedAmount, transactions]);

  /**
   * netLineColor - Memoized line color calculation
   *
   * Determines the color of the main line based on the current filter.
   * Colors used:
   * - Red (#ef4444) for expense filter
   * - Green (#22c55e) for income filter
   * - Blue (#3b82f6) for net (all transactions) view
   */
  const netLineColor = useMemo(() => {
    if (typeFilter === "EXPENSE") return lineColors.expense;
    if (typeFilter === "INCOME") return lineColors.income;
    return lineColors.net;
  }, [lineColors, typeFilter]); // Recalculate when filter changes

  const compareLegendItems = useMemo<CompareLegendItem[]>(
    () => [
      { key: "myNet", label: "My net", color: lineColors.net },
      ...compareSeries.map((series, index) => ({
        key: `series_${index}`,
        label: series.label,
        color: series.color,
      })),
    ],
    [compareSeries, lineColors.net],
  );

  function toggleCompareLine(key: string) {
    setHiddenCompareKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  }

  // Recharts generates SVG attributes during render. Waiting until mount keeps
  // the server HTML and the browser's first render identical.
  if (!isMounted) {
    return (
      <div className="rounded-card border border-border bg-surface-bg p-4">
        <div className="h-[300px]" />
      </div>
    );
  }

  // Early return: Show message if there's no data to display
  const activeChartData = mode === "compare" ? compareData : chartData;

  if (activeChartData.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-bg p-8 text-center text-sm text-muted-text">
        No data to display
      </div>
    );
  }

  /**
   * formatCurrency - Helper function to format monetary values
   *
   * Converts cents (number) to formatted currency string (e.g., "$1,234.56")
   * Used by the Y-axis and tooltip to display values
   */
  const formatCurrency = (value: number) => formatMoney(value, "USD");
  const formatAxisCurrency = (value: number) => {
    const absoluteValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absoluteValue >= 100_000_000) {
      return `${sign}$${Math.round(absoluteValue / 100_000_000)}M`;
    }

    if (absoluteValue >= 100_000) {
      return `${sign}$${Math.round(absoluteValue / 100_000)}K`;
    }

    return `${sign}$${Math.round(absoluteValue / 100)}`;
  };

  return (
    <div className="rounded-card border border-border bg-surface-bg p-4">
      {mode === "compare" && (
        <CompareLegend
          hiddenKeys={hiddenCompareKeys}
          items={compareLegendItems}
          onToggle={toggleCompareLine}
        />
      )}

      {/* ResponsiveContainer makes the chart adapt to its parent's width */}
      <ResponsiveContainer width="100%" height={300}>
        {/* LineChart is the main container component from Recharts library */}
        <LineChart
          data={activeChartData} // The data array we computed above
          margin={{ top: 5, right: 12, left: 8, bottom: 5 }} // Spacing around the chart
          onMouseLeave={() => setActiveCompareKey(null)}
        >
          {/* CartesianGrid - Displays the grid lines behind the chart */}
          <CartesianGrid
            strokeDasharray="3 3" // Dashed lines (3px dash, 3px gap)
            stroke="currentColor" // Uses CSS currentColor for theming
            className="opacity-20" // Makes grid lines subtle
          />

          {/* XAxis - Horizontal axis showing dates */}
          <XAxis
            dataKey="date" // Maps to the 'date' property in chartData
            stroke="currentColor"
            className="text-xs text-muted-text"
            tick={{ fontSize: 11 }}
            tickMargin={6}
          />

          {/* YAxis - Vertical axis showing monetary values */}
          <YAxis
            stroke="currentColor"
            className="text-xs text-muted-text"
            width={56}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            tickFormatter={formatAxisCurrency} // Keeps axis labels compact inside the tile
          />

          {/* Tooltip - Compare mode intentionally shows one focused series. */}
          {mode === "compare" ? (
            <Tooltip
              content={
                <CompareTooltip
                  activeKey={activeCompareKey}
                  formatCurrency={formatCurrency}
                  hiddenKeys={hiddenCompareKeys}
                />
              }
            />
          ) : (
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-bg)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
              }}
              formatter={(value) =>
                // Format the tooltip value as currency
                typeof value === "number" ? formatCurrency(value) : ""
              }
            />
          )}

          {mode === "compare" ? (
            <>
              <Line
                type="monotone"
                dataKey="myNet"
                hide={hiddenCompareKeys.has("myNet")}
                stroke={lineColors.net}
                strokeWidth={2.5}
                dot={false}
                activeDot={
                  activeCompareKey === null || activeCompareKey === "myNet"
                    ? { r: 4 }
                    : false
                }
                name="My net"
                onClick={() => setActiveCompareKey("myNet")}
                onMouseEnter={() => setActiveCompareKey("myNet")}
              />
              {compareSeries.map((series, index) => {
                const seriesKey = `series_${index}`;

                return (
                  <Line
                    key={series.id}
                    type="monotone"
                    dataKey={seriesKey}
                    hide={hiddenCompareKeys.has(seriesKey)}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={activeCompareKey === seriesKey ? { r: 4 } : false}
                    name={series.label}
                    onClick={() => setActiveCompareKey(seriesKey)}
                    onMouseEnter={() => setActiveCompareKey(seriesKey)}
                  />
                );
              })}
            </>
          ) : (
            <>
          {/* Conditional rendering: Show both income and expense lines when filter is null (show all) */}
          {typeFilter === null && (
            <>
              {/* Expense Line - Red line showing cumulative expenses */}
              <Line
                type="monotone" // Smooth curve interpolation
                dataKey="expense" // Maps to 'expense' property in chartData
                stroke={lineColors.expense}
                strokeWidth={2}
                dot={false} // Hide individual data point dots for cleaner look
                name="Expenses" // Label shown in legend/tooltip
              />
              {/* Income Line - Green line showing cumulative income */}
              <Line
                type="monotone"
                dataKey="income" // Maps to 'income' property in chartData
                stroke={lineColors.income}
                strokeWidth={2}
                dot={false}
                name="Income"
              />
            </>
          )}

          {/* Main Line - The primary line that's always displayed */}
          {/* When filter is null: shows net (blue)
              When filter is EXPENSE: shows expenses (red)
              When filter is INCOME: shows income (green) */}
          <Line
            type="monotone"
            dataKey="amount" // Maps to 'amount' property (changes based on filter)
            stroke={netLineColor} // Color determined by filter (red/green/blue)
            strokeWidth={2}
            dot={false}
            name={
              // Dynamic label based on current filter
              typeFilter === "EXPENSE"
                ? "Expenses"
                : typeFilter === "INCOME"
                ? "Income"
                : "Net"
            }
          />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareLegend({
  hiddenKeys,
  items,
  onToggle,
}: {
  hiddenKeys: Set<string>;
  items: CompareLegendItem[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2 text-xs">
      {items.map((item) => {
        const isHidden = hiddenKeys.has(item.key);

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className={[
              "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 font-semibold transition",
              isHidden
                ? "border-border bg-raised-bg text-muted-text opacity-50"
                : "border-border bg-raised-bg text-primary-text hover:border-border-hover",
            ].join(" ")}
            title={isHidden ? "Show line" : "Hide line"}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CompareTooltip({
  active,
  activeKey,
  formatCurrency,
  hiddenKeys,
  label,
  payload,
}: CompareTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Hovering a line sets activeKey. Touch/keyboard fallback keeps the tooltip
  // useful by showing one series instead of flooding the chart with every line.
  const visiblePayload = payload.filter(
    (item) => !hiddenKeys.has(String(item.dataKey)),
  );
  if (visiblePayload.length === 0) return null;

  const focusedPayload =
    visiblePayload.find((item) => item.dataKey === activeKey) ??
    visiblePayload[0];

  if (typeof focusedPayload.value !== "number") return null;

  const color = focusedPayload.color ?? focusedPayload.stroke ?? "#eab308";

  return (
    <div className="rounded-xl border border-border bg-surface-bg px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-primary-text">{label}</div>
      <div className="flex items-center gap-2 text-muted-text">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="max-w-[220px] truncate">
          {focusedPayload.name}
        </span>
        <span className="font-semibold text-primary-text">
          {formatCurrency(focusedPayload.value)}
        </span>
      </div>
    </div>
  );
}
