import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import TransactionsClient from "./TransactionsClient";
import { createAuthRequest } from "@/src/shared/utils/api";

export default async function TransactionsPage() {
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  const req = createAuthRequest(cookieString);

  const user = await getCurrentUserFromRequest(req);

  if (!user) {
    redirect("/login");
  }

  return <TransactionsClient />;
}
