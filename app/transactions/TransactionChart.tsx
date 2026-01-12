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
 * - Displays different lines based on filter: income (green), expenses (red), or net (blue)
 * - Responsive chart that adapts to container width
 */

"use client";

import { useMemo } from "react";
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
export default function TransactionsChart({ transactions, typeFilter }: Props) {
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
    let runningIncome = 0;
    let runningExpense = 0;

    // Transform sorted days into chart data points with running totals
    return sortedDays.map((day) => {
      // Add today's amounts to the running totals
      runningIncome += day.dailyIncome;
      runningExpense += day.dailyExpense;
      // Net = total income - total expenses (can be negative if expenses exceed income)
      const net = runningIncome - runningExpense;

      return {
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
      };
    });
  }, [transactions, typeFilter]); // Recalculate when transactions or filter changes

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
    if (typeFilter === "EXPENSE") return "#ef4444"; // red for expenses
    if (typeFilter === "INCOME") return "#22c55e"; // green for income
    return "#3b82f6"; // blue for net
  }, [typeFilter]); // Recalculate when filter changes

  // Early return: Show message if there's no data to display
  if (chartData.length === 0) {
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

  return (
    <div className="rounded-card border border-border bg-surface-bg p-4">
      {/* ResponsiveContainer makes the chart adapt to its parent's width */}
      <ResponsiveContainer width="100%" height={300}>
        {/* LineChart is the main container component from Recharts library */}
        <LineChart
          data={chartData} // The data array we computed above
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }} // Spacing around the chart
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
          />

          {/* YAxis - Vertical axis showing monetary values */}
          <YAxis
            stroke="currentColor"
            className="text-xs text-muted-text"
            tick={{fontSize: 12}}
            tickFormatter={formatCurrency} // Formats numbers as currency ($1,234.56)
          />

          {/* Tooltip - Appears when hovering over data points */}
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface-bg)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
            }}
            formatter={(value: number | undefined) =>
              // Format the tooltip value as currency
              value !== undefined ? formatCurrency(value) : ""
            }
          />

          {/* Conditional rendering: Show both income and expense lines when filter is null (show all) */}
          {typeFilter === null && (
            <>
              {/* Expense Line - Red line showing cumulative expenses */}
              <Line
                type="monotone" // Smooth curve interpolation
                dataKey="expense" // Maps to 'expense' property in chartData
                stroke="#ef4444" // Red color (Tailwind red-500)
                strokeWidth={2}
                dot={false} // Hide individual data point dots for cleaner look
                name="Expenses" // Label shown in legend/tooltip
              />
              {/* Income Line - Green line showing cumulative income */}
              <Line
                type="monotone"
                dataKey="income" // Maps to 'income' property in chartData
                stroke="#22c55e" // Green color (Tailwind green-500)
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
