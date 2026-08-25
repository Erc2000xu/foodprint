import { notFound } from "next/navigation";
import { PhotoUploadE2eHarness } from "@/components/e2e/photo-upload-harness";

export const dynamic = "force-dynamic";

export default async function PhotoUploadE2ePage({ searchParams }: { searchParams?: Promise<{ force_wasm?: string | string[] }> }) {
  if (process.env.E2E_PHOTO_UPLOAD !== "1") notFound();
  const params = await searchParams;
  const forceWasm = params?.force_wasm === "1";
  return <PhotoUploadE2eHarness forceWasm={forceWasm} />;
}
