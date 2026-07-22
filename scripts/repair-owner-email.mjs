import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FOODPRINT_OWNER_EMAIL", "FOODPRINT_GROUP_SLUG"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name} in .env.local`);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: group, error: groupError } = await admin
  .from("groups")
  .select("owner_user_id")
  .eq("slug", process.env.FOODPRINT_GROUP_SLUG)
  .single();
if (groupError) throw groupError;

const { data: existing, error: existingError } = await admin.auth.admin.getUserById(group.owner_user_id);
if (existingError) throw existingError;
if (existing.user.email === process.env.FOODPRINT_OWNER_EMAIL) {
  console.log("Owner email is already correct.");
} else {
  const { data, error } = await admin.auth.admin.updateUserById(group.owner_user_id, {
    email: process.env.FOODPRINT_OWNER_EMAIL,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Owner email corrected for ${data.user.email}`);
}
