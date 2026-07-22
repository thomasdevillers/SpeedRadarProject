import { createClient } from "@/lib/supabase/server";

export interface RoadSafeAdmin {
  userId: string;
  email: string;
}

export async function requireRoadSafeAdmin(): Promise<RoadSafeAdmin> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return { userId: "00000000-0000-4000-8000-000000000001", email: "admin@roadsafe.co.za" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Authentication required", { status: 401 });
  const { data } = await supabase.from("profiles").select("platform_role").eq("user_id", user.id).single();
  if (data?.platform_role !== "roadsafe_admin") throw new Response("RoadSafe administrator access required", { status: 403 });
  return { userId: user.id, email: user.email ?? "" };
}

