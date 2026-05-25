import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";

type PlaidEnvironment = keyof typeof PlaidEnvironments;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required Plaid environment variable: ${name}`);
  }

  return value;
}

function getPlaidEnvironment(): PlaidEnvironment {
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (env === "sandbox" || env === "development" || env === "production") {
    return env;
  }

  throw new Error(
    `Invalid PLAID_ENV "${env}". Use sandbox, development, or production.`,
  );
}

// Plaid products this app asks the user to connect. Start small with
// transactions because that is enough to import income and expenses.
export const plaidProducts: Products[] = [Products.Transactions];

// Start with US institutions. This can become env-driven later.
export const plaidCountryCodes: CountryCode[] = [CountryCode.Us];

// The Plaid SDK client is server-only. API routes and services import this
// object instead of rebuilding Plaid configuration in every route.
export const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[getPlaidEnvironment()],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": requireEnv("PLAID_CLIENT_ID"),
        "PLAID-SECRET": requireEnv("PLAID_SECRET"),
        "Plaid-Version": "2020-09-14",
      },
    },
  }),
);
