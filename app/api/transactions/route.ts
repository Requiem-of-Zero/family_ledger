import { NextResponse } from "next/server";
import {
  CreateTransactionSchema,
  ListTransactionSchema,
} from "@/src/shared/validators/transactions";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import {
  createTransactionForUser,
  listTransactionsForUser,
} from "@/src/server/services/transactions.service";
import { HttpError } from "@/src/server/services/auth.service";

/*
 * POST /api/transactions
 * Creates a new transaction for the currently logged in user
 */
export async function POST(req: Request) {
  try {
    // Authenticate the user
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    // Parse the request body
    let body: unknown;

    try {
      body = await req.json();
      // console.log(body);
    } catch (error) {
      throw new HttpError("Invalid JSON body", 400);
    }

    // Validate the request body with Zod
    const parsed = CreateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError("Invalid Request", 400, parsed.error.issues);
    }

    // Create the transaction for the current user
    const transaction = await createTransactionForUser(user.id, parsed.data);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/*
 * GET /api/transactions?from=...&to-...&familyId=...
 * Lists transactions for the current logged in user (optionally filtered)
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unathorized", 401);

    // Parse the query params into an object for zod validation
    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    // Validate query params
    const parsed = ListTransactionSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new HttpError("Invalid query params", 400, {
        issues: parsed.error.issues,
      });
    }

    const transactions = await listTransactionsForUser(user.id, parsed.data);

    return NextResponse.json({ transactions }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
