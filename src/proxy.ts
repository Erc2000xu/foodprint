import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) { return updateSession(request); }
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest(?:/|$)|service-worker\\.js(?:/|$)|api/(?:health|metrics)(?:/|$)|offline(?:/|$)|launch(?:/|$)|login(?:/|$)|forgot-password(?:/|$)|reset-password(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)(?:/|$)).*)",
  ],
};
