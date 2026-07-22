import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_MAP_PROVIDER: z.literal("amap").default("amap"),
  NEXT_PUBLIC_AMAP_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

/** Parses only values intentionally allowed in the browser bundle. */
export function readPublicEnvironment(env: Record<string, string | undefined> = process.env): PublicEnvironment {
  return publicEnvironmentSchema.parse(env);
}
