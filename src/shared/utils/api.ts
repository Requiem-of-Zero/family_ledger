/**
 * API URL Utilities
 *
 * Provides helper functions for getting the base URL of the application
 * in different contexts (server-side, client-side, for API calls)
 */

/**
 * getBaseUrl - Gets the base URL of the application
 *
 * For server-side use (in Server Components, API routes, etc.)
 * Uses environment variables or Vercel URL detection
 *
 * @returns The base URL (e.g., "https://your-app.vercel.app" or "http://localhost:3000")
 */
export function getBaseUrl(): string {
  // In production on Vercel, use VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Use explicit NEXT_PUBLIC_APP_URL if set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Use APP_URL for server-side
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  // Default to localhost for development
  return "http://localhost:3000";
}

/**
 * getApiUrl - Gets the full API URL for making requests
 *
 * For server-side fetch calls that need absolute URLs
 *
 * @param path - API path (e.g., "/api/transactions" or "/api/transactions/123")
 * @returns Full URL (e.g., "https://your-app.vercel.app/api/transactions")
 */
export function getApiUrl(path: string): string {
  const baseUrl = getBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * createAuthRequest - Creates a Request object for authentication checks
 *
 * Used in server components to check authentication.
 * The URL doesn't matter for auth - it's just used for cookie parsing.
 *
 * @param cookieString - Cookie string from next/headers cookies()
 * @param path - Optional path for the request (defaults to "/")
 * @returns Request object with cookies for auth checking
 */
export function createAuthRequest(
  cookieString: string,
  path: string = "/"
): Request {
  const baseUrl = getBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new Request(`${baseUrl}${normalizedPath}`, {
    headers: { cookie: cookieString },
  });
}
