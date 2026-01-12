/**
 * TransactionDetailPage - Server Component
 *
 * This is a Next.js server component that handles the transaction detail page route.
 * Server components run on the server, allowing us to:
 * - Fetch data directly from the database/API
 * - Check authentication before rendering
 * - Handle 404 errors properly
 *
 * Route: /transactions/[id]
 * Example: /transactions/123 shows details for transaction with ID 123
 *
 * Process:
 * 1. Extract transaction ID from URL params
 * 2. Authenticate the user
 * 3. Fetch the transaction from the API
 * 4. Render the detail view or show 404 if not found
 */

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { createAuthRequest, getApiUrl } from "@/src/shared/utils/api";
import TransactionDetailClient from "./TransactionDetailClient";

/**
 * TransactionDetailPage Component
 *
 * Server component that fetches and displays a single transaction's details.
 * This component runs on the server, so it can access cookies and make
 * authenticated API calls before rendering.
 *
 * @param params - Next.js route params containing the transaction ID
 * @returns JSX element with the transaction detail view, or triggers 404/redirect
 */
export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ==================== EXTRACT URL PARAMETER ====================

  /**
   * Extract the transaction ID from the URL
   * In Next.js App Router, params is a Promise that must be awaited
   * Example URL: /transactions/123 → id = "123"
   */
  const { id } = await params;

  /**
   * Parse the ID string to an integer
   * The URL param is always a string, but we need a number for the API
   * parseInt(string, 10) converts to base-10 integer
   */
  const transactionId = parseInt(id, 10);

  // ==================== AUTHENTICATION CHECK ====================

  /**
   * Get cookies from the incoming request
   * Cookies contain the session token for authentication
   */
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  /**
   * Create a Request object to check authentication
   * We need to pass cookies to the auth function
   */
  const req = createAuthRequest(cookieString, "/transactions");

  /**
   * Check if user is authenticated
   * Returns the user object if logged in, null otherwise
   */
  const user = await getCurrentUserFromRequest(req);

  /**
   * Redirect to login if user is not authenticated
   * This prevents unauthorized access to transaction details
   */
  if (!user) redirect("/login");

  // ==================== FETCH TRANSACTION DATA ====================

  /**
   * Fetch the transaction from the API
   * We use fetch here because we're in a server component and can make
   * authenticated requests using cookies
   */
  try {
    /**
     * Make API request to get the transaction
     * cache: "no-store" ensures we always get fresh data (no caching)
     */
    const res = await fetch(
      getApiUrl(`/api/transactions/${transactionId}`),
      {
        headers: {
          cookie: cookieString, // Include auth cookies
        },
        cache: "no-store", // Always fetch fresh data, don't cache
      }
    );

    /**
     * Handle API response errors
     * 404 = transaction doesn't exist or user doesn't have access
     * Other errors = server/network issues
     */
    if (!res.ok) {
      if (res.status === 404) {
        // Transaction not found - show Next.js 404 page
        notFound();
      }
      // Other errors - throw to be caught by catch block
      throw new Error("Failed to fetch transaction");
    }

    /**
     * Parse the JSON response
     * API returns: { transaction: Transaction }
     */
    const body = await res.json();
    const transaction = body.transaction;

    /**
     * Render the client component with the transaction data
     * The client component handles all the interactive UI
     */
    return <TransactionDetailClient transaction={transaction} />;
  } catch (error) {
    /**
     * Error handling for any failures
     * Log the error for debugging and show 404 page
     * This catches network errors, parsing errors, etc.
     */
    console.error("Error fetching transaction:", error);
    notFound(); // Show 404 page on any error
  }
}
