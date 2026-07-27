import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") || "/auth/accept-invite";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "This sign-in link is invalid or has expired. Please request a new invitation.");
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.redirect(new URL(next, request.url));
}
