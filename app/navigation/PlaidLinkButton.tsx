"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

type PlaidLinkMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
  } | null;
};

type Props = {
  label?: string;
  connectingLabel?: string;
  className?: string;
  onConnected?: () => void;
};

export default function PlaidLinkButton({
  label = "Connect bank",
  connectingLabel = "Connecting...",
  className = "rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover disabled:opacity-70",
  onConnected,
}: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldOpenRef = useRef(false);

  const exchangePublicToken = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Once Plaid Link succeeds, the frontend receives a short-lived public
        // token. Send it to the server so it can store the real access token.
        const res = await fetch("/api/plaid/public-token/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ publicToken, metadata }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to connect bank");
        }

        // After the bank is stored, immediately sync transactions so the
        // transactions page can show data without a manual curl/request.
        const syncRes = await fetch("/api/plaid/transactions/sync", {
          method: "POST",
          credentials: "include",
        });

        if (!syncRes.ok) {
          const body = await syncRes.json().catch(() => ({}));
          throw new Error(body?.error ?? "Connected bank, but sync failed");
        }

        onConnected?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect bank");
      } finally {
        setIsConnecting(false);
      }
    },
    [onConnected],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: exchangePublicToken,
  });

  useEffect(() => {
    if (!shouldOpenRef.current || !ready) return;

    // Plaid Link can only open after the link token has loaded into the hook.
    open();
    shouldOpenRef.current = false;
  }, [open, ready]);

  async function handleConnectBank() {
    setIsConnecting(true);
    setError(null);

    try {
      // Ask our backend for a fresh Link token. Link tokens are short-lived, so
      // creating one on click keeps the flow predictable during local testing.
      const res = await fetch("/api/plaid/link-token/create", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to start Plaid Link");
      }

      const body = (await res.json()) as { linkToken: string };
      setLinkToken(body.linkToken);
      shouldOpenRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Plaid Link");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleConnectBank}
        disabled={isConnecting}
        className={className}
      >
        {isConnecting ? connectingLabel : label}
      </button>
      {error && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-danger bg-danger-bg px-3 py-2 text-xs text-danger-text shadow-card">
          {error}
        </div>
      )}
    </div>
  );
}
