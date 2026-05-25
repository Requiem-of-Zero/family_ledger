import { prisma } from "@/src/server/db/prisma";
import {
  plaidClient,
  plaidCountryCodes,
  plaidProducts,
} from "@/src/server/plaid/client";
import { getDefaultFamilyIdForUser } from "@/src/server/services/transactions.service";
import type { Transaction as PlaidTransaction } from "plaid";

type PlaidExchangeMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
  } | null;
};

export async function createPlaidLinkTokenForUser(user: {
  id: number;
  email: string;
}) {
  // Link tokens are short-lived tokens used by the browser to open Plaid Link.
  // They do not grant bank data access by themselves.
  const response = await plaidClient.linkTokenCreate({
    client_name: "Family Ledger",
    country_codes: plaidCountryCodes,
    language: "en",
    products: plaidProducts,
    user: {
      client_user_id: String(user.id),
      email_address: user.email,
    },
  });

  return response.data.link_token;
}

export async function exchangePublicTokenForUser(
  userId: number,
  publicToken: string,
  metadata?: PlaidExchangeMetadata,
) {
  // The public token comes from Plaid Link. It is temporary, so the server
  // exchanges it for the long-lived access token used for future API calls.
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  // After exchange, fetch accounts so the app knows which checking/savings/etc.
  // accounts belong to this connected Plaid item.
  const accountsResponse = await plaidClient.accountsGet({
    access_token: accessToken,
  });

  const institutionId = metadata?.institution?.institution_id ?? null;
  const institutionName = metadata?.institution?.name ?? null;

  const plaidItem = await prisma.plaidItem.upsert({
    where: { itemId },
    update: {
      // TODO: Encrypt this before production. Plaintext is acceptable only for
      // this local sandbox skeleton while we prove the flow.
      accessToken,
      institutionId,
      institutionName,
      userId,
    },
    create: {
      userId,
      itemId,
      accessToken,
      institutionId,
      institutionName,
    },
  });

  // Store/update accounts idempotently. Plaid account IDs are stable for an
  // Item, so upsert prevents duplicate rows when the user reconnects.
  for (const account of accountsResponse.data.accounts) {
    await prisma.plaidAccount.upsert({
      where: { accountId: account.account_id },
      update: {
        plaidItemId: plaidItem.id,
        name: account.name,
        officialName: account.official_name ?? null,
        mask: account.mask ?? null,
        type: account.type,
        subtype: account.subtype ?? null,
      },
      create: {
        plaidItemId: plaidItem.id,
        accountId: account.account_id,
        name: account.name,
        officialName: account.official_name ?? null,
        mask: account.mask ?? null,
        type: account.type,
        subtype: account.subtype ?? null,
      },
    });
  }

  return {
    itemId,
    accountsStored: accountsResponse.data.accounts.length,
  };
}

export async function listPlaidAccountsForUser(userId: number) {
  return prisma.plaidAccount.findMany({
    where: {
      item: { userId },
    },
    select: {
      id: true,
      name: true,
      mask: true,
      type: true,
      subtype: true,
      item: {
        select: {
          id: true,
          institutionName: true,
        },
      },
    },
    orderBy: [{ item: { institutionName: "asc" } }, { name: "asc" }],
  });
}

export async function disconnectPlaidItemForUser(
  userId: number,
  plaidItemId: number,
  options: { deleteImportedTransactions?: boolean } = {},
) {
  const item = await prisma.plaidItem.findFirst({
    where: {
      id: plaidItemId,
      userId,
    },
    include: {
      accounts: {
        select: { id: true },
      },
    },
  });

  if (!item) return null;

  // Ask Plaid to revoke this Item's access token first. After this succeeds,
  // remove our local token/account records too.
  await plaidClient.itemRemove({
    access_token: item.accessToken,
  });

  const accountIds = item.accounts.map((account) => account.id);
  let affectedTransactionsCount = 0;

  await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.updateMany({
      where: {
        createdByUserId: userId,
        plaidAccountId: { in: accountIds },
      },
      data: options.deleteImportedTransactions
        ? { deletedAt: new Date() }
        : { plaidAccountId: null },
    });
    affectedTransactionsCount = transactions.count;

    await tx.plaidItem.delete({
      where: { id: item.id },
    });
  });

  return {
    disconnectedItemId: item.id,
    deletedImportedTransactions: Boolean(options.deleteImportedTransactions),
    affectedTransactionsCount,
  };
}

function mapPlaidAmountToLedgerType(amount: number) {
  // Plaid Transactions uses positive amounts for money leaving the account
  // and negative amounts for money entering the account.
  return amount < 0 ? "INCOME" : "EXPENSE";
}

function mapPlaidAmountToCents(amount: number) {
  return Math.round(Math.abs(amount) * 100);
}

function mapPlaidDateToDate(date: string) {
  // Plaid dates are calendar dates like "2026-05-24". Store them at noon UTC
  // to avoid timezone conversion shifting the ledger day backward/forward.
  return new Date(`${date}T12:00:00.000Z`);
}

async function upsertPlaidTransaction(
  userId: number,
  familyId: number | null,
  plaidAccountId: number,
  transaction: PlaidTransaction,
) {
  const type = mapPlaidAmountToLedgerType(transaction.amount);
  const amountCents = mapPlaidAmountToCents(transaction.amount);

  await prisma.transaction.upsert({
    where: { plaidTransactionId: transaction.transaction_id },
    update: {
      amountCents,
      type,
      merchant: transaction.merchant_name ?? transaction.name,
      note: transaction.name,
      occurredAt: mapPlaidDateToDate(transaction.date),
      familyId,
      plaidAccountId,
      createdByUserId: userId,
      deletedAt: null,
    },
    create: {
      createdByUserId: userId,
      familyId,
      plaidAccountId,
      plaidTransactionId: transaction.transaction_id,
      amountCents,
      type,
      merchant: transaction.merchant_name ?? transaction.name,
      note: transaction.name,
      occurredAt: mapPlaidDateToDate(transaction.date),
    },
  });
}

export async function syncPlaidTransactionsForUser(userId: number) {
  const defaultFamilyId = await getDefaultFamilyIdForUser(userId);

  const items = await prisma.plaidItem.findMany({
    where: { userId },
    include: { accounts: true },
  });

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  for (const item of items) {
    let cursor = item.transactionsCursor ?? undefined;
    let hasMore = true;
    let nextCursor = cursor;

    while (hasMore) {
      // /transactions/sync returns added, modified, and removed changes since
      // the last cursor. On first sync, cursor is empty and Plaid returns history.
      const response = await plaidClient.transactionsSync({
        access_token: item.accessToken,
        cursor,
        count: 100,
      });

      const accountByPlaidId = new Map(
        item.accounts.map((account) => [account.accountId, account.id]),
      );

      for (const transaction of response.data.added) {
        const plaidAccountId = accountByPlaidId.get(transaction.account_id);
        if (!plaidAccountId) continue;

        await upsertPlaidTransaction(
          userId,
          defaultFamilyId,
          plaidAccountId,
          transaction,
        );
        addedCount += 1;
      }

      for (const transaction of response.data.modified) {
        const plaidAccountId = accountByPlaidId.get(transaction.account_id);
        if (!plaidAccountId) continue;

        await upsertPlaidTransaction(
          userId,
          defaultFamilyId,
          plaidAccountId,
          transaction,
        );
        modifiedCount += 1;
      }

      for (const removed of response.data.removed) {
        await prisma.transaction.updateMany({
          where: {
            createdByUserId: userId,
            plaidTransactionId: removed.transaction_id,
          },
          data: { deletedAt: new Date() },
        });
        removedCount += 1;
      }

      cursor = response.data.next_cursor;
      nextCursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    }

    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { transactionsCursor: nextCursor },
    });
  }

  return {
    itemsSynced: items.length,
    addedCount,
    modifiedCount,
    removedCount,
  };
}
