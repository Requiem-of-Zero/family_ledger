import { cookies } from "next/headers"; // import cookies so the server can read request cookies
import { redirect } from "next/navigation"; // import redirect() so the server can redirect before rendering the page
import LoginClient from "./LoginClient"; // Import the client login component (the form)
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { createAuthRequest } from "@/src/shared/utils/api";

export default async function LoginPage() {
  const cookieStore = await cookies(); // Read incoming request cookies on the server
  const cookieString = cookieStore.toString();
  const req = createAuthRequest(cookieString);

  const user = await getCurrentUserFromRequest(req);

  // console.log(user);
  if (user) redirect("/transactions"); // If user is already authenticated, send them to the transactions page

  return <LoginClient />; // Render the client component (form + submit)
}
