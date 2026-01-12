"use client"; // Tells Next.js the component runs in the browser (for form state and click handlers)
import { useRouter } from "next/navigation"; // Import useRouter for client-side navigation after successful authentication
import React, { useState } from "react"; // Import useState for managing component states

type Mode = "login" | "register";

export default function LoginClient() {
  const router = useRouter(); // Create a router instance to navigate after successful authentication

  const [email, setEmail] = useState(""); // Store the email input value in React state, initializing it as a empty string
  const [password, setPassword] = useState(""); // Store the password input value in React state, initializing it as a empty string
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission state to enable or disable the button to prevent multiple requests
  const [error, setError] = useState<string | null>(null); // Store error message to display to client if login fails
  const [mode, setMode] = useState<Mode>("login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // Prevent the browser from doing normal HTML form submission

    setError(null); // Clear prior errors before attempting again.
    setIsSubmitting(true); // Turn on loading state for button

    const endpoint =
      mode === "login" ? "/api/auth/login" : "/api/auth/register";

    const body =
      mode === "login" ? { email, password } : { email, password, username };

    // Call your existing login endpoint
    const authRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include", // Include credentials int he headers so the browser will store the session cookie
      body: JSON.stringify(body),
    });

    // If login response not ok, show the returned error by updating the error state
    if (!authRes.ok) {
      const data = await authRes.json().catch(() => ({}));
      setError(data?.error ?? "Login Failed");
      setIsSubmitting(false);
      return;
    }

    // Login success brings you to transactions page
    router.push("/transactions");
    router.refresh(); // Refresh so server components are able to see the new cookie
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-primary-bg text-primary-text flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface-bg p-6 shadow-card">
        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Login" : "Create account"}
        </h1>
        {/* Mode toggle */}
        <div className="mt-4 grid grid-cols-2 rounded-xl border border-border bg-raised-bg p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={[
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              mode === "login"
                ? "bg-primary text-primary-fg"
                : "text-muted-text hover:text-primary-text",
            ].join(" ")}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => setMode("register")}
            className={[
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              mode === "register"
                ? "bg-primary text-primary-fg"
                : "text-muted-text hover:text-primary-text",
            ].join(" ")}
          >
            Register
          </button>
        </div>
        {/* Google OAuth */}
        {/* // Handles Google Oauth by redirecting to /api/auth/google/start endpoint */}
        {/* * Triggers this flow: */}
        {/* * 1. Get /api/auth/google/start */}
        {/* * 2. Redirect to Google consent screen */}
        {/* * 3. Google redirects back to /api/auth/google/callback */}
        {/* * 4. Call back sets SESSION_COOKIE_NAME and redirects to APP_URL */}
        <a
          href="/api/auth/google/start"
          className="mt-6 block w-full rounded-xl border border-border bg-raised-bg px-4 py-2 text-center text-sm font-semibold text-primary-text hover:border-border-hover"
        >
          Continue with Google
        </a>
        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-text">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-xl border border-danger bg-danger-bg px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}
        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Only show username input in register mode */}
          {mode === "register" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-primary-text">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
                placeholder="samwong"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-primary-text">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="w-full rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting
              ? "Working..."
              : mode === "login"
                ? "Login"
                : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
