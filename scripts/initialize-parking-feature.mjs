import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const groupId = process.env.FOODPRINT_PARKING_GROUP_ID;
const managerUserId = process.env.FOODPRINT_PARKING_MANAGER_USER_ID;
const enabled = process.env.FOODPRINT_PARKING_ENABLED === "true";

if (!supabaseUrl || !serviceRoleKey || !groupId || !managerUserId) {
  console.error("需要 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、FOODPRINT_PARKING_GROUP_ID 和 FOODPRINT_PARKING_MANAGER_USER_ID。未写入任何数据。");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { error } = await supabase.rpc("initialize_parking_feature", {
  p_group_id: groupId,
  p_manager_user_id: managerUserId,
  p_enabled: enabled,
});

if (error) {
  console.error(`停车地图初始化失败：${error.message}`);
  process.exit(1);
}

console.log(`停车地图配置已写入：group=${groupId}，manager=${managerUserId}，enabled=${enabled}`);
