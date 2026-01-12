import { NextResponse } from "next/server";
import {
  TransactionIdSchema,
  UpdateTransactionSchema,
} from "@/src/shared/validators/transactions";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import {
  getTransactionForUserById,
  softDeleteTransactionForUserById,
  updateTransactionForUserById,
} from "@/src/server/services/transactions.service";
import { HttpError } from "@/src/server/services/auth.service";

/*
 * GET /api/transactions/:id
 * Gets a single transaction by id for the logged in user
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // console.log("req.url =", req.url);
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 404);

    const { id } = await params;

    const parsedId = TransactionIdSchema.safeParse(id);
    if (!parsedId.success)
      throw new HttpError("Invalid transaction id", 400, {
        issues: parsedId.error.issues,
      });

    const transaction = await getTransactionForUserById(user.id, parsedId.data);
    if (!transaction) throw new HttpError("Transaction not found", 404);

    return NextResponse.json({ transaction }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("GET /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/*
 * PATCH /api/transactions/:id
 * Updates a single transaction id from header, the request will contain the body of the payload
 */

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 401);

    const { id } = await params;

    const parsedId = TransactionIdSchema.safeParse(id);
    if (!parsedId.success)
      throw new HttpError("Invalid transaction id", 400, {
        issues: parsedId.error.issues,
      });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Invalid JSON body", 400);
    }

    const parsedBody = UpdateTransactionSchema.safeParse(body);
    if (!parsedBody.success)
      throw new HttpError("Invalid request body", 400, {
        issues: parsedBody.error.issues,
      });

    const updatedObj = await updateTransactionForUserById(
      user.id,
      parsedId.data,
      parsedBody.data,
    );

    if (!updatedObj) throw new HttpError("No transaction found", 404);

    return NextResponse.json({ transaction: updatedObj }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }

    console.error("PATCH /api/transactions/:id error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

/*
 * DELETE /api/transactions/:id
 * Gets a single transaction by id for the logged in user and updates the deletedAt to simulate a soft deletion of a transaction
 */

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) throw new HttpError("Unauthorized", 400);

    const { id } = await params;

    const parsedId = TransactionIdSchema.safeParse(id);

    if (!parsedId.success)
      throw new HttpError("Invalid transaction id", 400, {
        issues: parsedId.error.issues,
      });

    const deletedObject = await softDeleteTransactionForUserById(
      user.id,
      parsedId.data,
    );

    if (!deletedObject) throw new HttpError("Transaction not found", 404);

    return NextResponse.json({ transaction: deletedObject }, { status: 200 });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        {
          message: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    console.error("DELETE /api/transaction/:id error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
