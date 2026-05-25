"use client";

import { useRouter } from "next/navigation";
import PlaidLinkButton from "@/app/navigation/PlaidLinkButton";

type Props = {
  hasConnections: boolean;
};

export default function ProfileBankConnect({ hasConnections }: Props) {
  const router = useRouter();

  return (
    <div className="mt-4 rounded-xl border border-border bg-raised-bg p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-primary-text">
            {hasConnections ? "Connect another bank" : "Connect your first bank"}
          </div>
          <p className="mt-1 text-sm text-muted-text">
            {hasConnections
              ? "Add another account and sync its transactions."
              : "Use Plaid to securely add accounts and import transactions."}
          </p>
        </div>
        <PlaidLinkButton
          label={hasConnections ? "Connect more" : "Connect bank"}
          connectingLabel="Connecting and syncing..."
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-70"
          onConnected={() => router.refresh()}
        />
      </div>
    </div>
  );
}
