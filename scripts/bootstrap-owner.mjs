import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FOODPRINT_OWNER_EMAIL", "FOODPRINT_OWNER_PASSWORD", "FOODPRINT_GROUP_NAME", "FOODPRINT_GROUP_SLUG"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name} in .env.local`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: created, error: createError } = await admin.auth.admin.createUser({ email: process.env.FOODPRINT_OWNER_EMAIL, password: process.env.FOODPRINT_OWNER_PASSWORD, email_confirm: true, user_metadata: { display_name: "Eric" } });
if (createError) throw createError;
const { error: bootstrapError } = await admin.rpc("bootstrap_initial_owner", { p_owner_user_id: created.user.id, p_group_name: process.env.FOODPRINT_GROUP_NAME, p_group_slug: process.env.FOODPRINT_GROUP_SLUG });
if (bootstrapError) throw bootstrapError;
console.log(`Owner and group created for ${created.user.email}`);
