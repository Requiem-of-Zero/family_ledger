import { NextResponse } from "next/server";
import crypto from "crypto";

// Minimal state token to prevent CSRF
function generateState() {
  // We will store this in a small cookie and verify in the callback
  return crypto.randomBytes(16).toString("hex");
}

export async function GET(req: Request) {
  const state = generateState();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_OAUTH_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");

  url.searchParams.set("scope", "openid email profile") // OIDC scope for basic identity (email+profile)

  url.searchParams.set("access_type", "online") // Set the access type to online for the initialized google user

  url.searchParams.set("state", state); // Set the state as the randomly generated token

  const res = NextResponse.redirect(url);

  // Save the cookie state to be validated by the callback
  res.cookies.set({
    name: "oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 // 10 minutes age
  })

  return res
}
