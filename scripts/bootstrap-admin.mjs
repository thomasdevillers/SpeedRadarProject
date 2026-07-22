import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.env.ROADSAFE_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ROADSAFE_ADMIN_PASSWORD;

if (!url || !secret || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, ROADSAFE_ADMIN_EMAIL and ROADSAFE_ADMIN_PASSWORD first.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("ROADSAFE_ADMIN_PASSWORD must contain at least 12 characters.");
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "RoadSafe Admin" } });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw error;
  user = data.user;
}

const { data: organization, error: organizationError } = await supabase.from("organizations").upsert({ name: "RoadSafe Internal", slug: "roadsafe-internal", is_internal: true, status: "active" }, { onConflict: "slug" }).select("id").single();
if (organizationError) throw organizationError;
const { error: profileError } = await supabase.from("profiles").upsert({ user_id: user.id, display_name: "RoadSafe Admin", email, platform_role: "roadsafe_admin" });
if (profileError) throw profileError;

console.log(`RoadSafe administrator ready: ${email}`);
console.log(`Internal organisation: ${organization.id}`);
