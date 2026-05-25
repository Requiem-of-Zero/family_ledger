import { prisma } from "@/src/server/db/prisma";
import {
  plaidClient,
  plaidCountryCodes,
  plaidProducts,
} from "@/src/server/plaid/client";

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
