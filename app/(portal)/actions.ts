"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
