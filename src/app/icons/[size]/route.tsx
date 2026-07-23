import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;
  const size = Number(rawSize);
  if (![180, 192, 512].includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#167d76" }}><svg width={size * 0.78} height={size * 0.78} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="食迹的腊肠狗图标"><rect x="17" y="49" width="166" height="102" rx="51" fill="#ed7655" /><circle cx="43" cy="84" r="39" fill="#ed7655" /><path d="M22 64C6 44 12 20 35 22c9 1 15 10 15 25" fill="#ca593e" /><path d="M64 139v31M147 139v31" stroke="#5b3c34" strokeWidth="14" strokeLinecap="round" /><circle cx="34" cy="77" r="5" fill="#183b3a" /><circle cx="57" cy="99" r="5" fill="#183b3a" /><path d="M42 110c8 6 17 6 24 0" fill="none" stroke="#183b3a" strokeWidth="5" strokeLinecap="round" /><rect x="93" y="75" width="37" height="51" rx="10" fill="#fff3d9" stroke="#183b3a" strokeWidth="5" /><path d="M103 86h17M103 98h17M103 110h12" stroke="#167d76" strokeWidth="5" strokeLinecap="round" /><path d="M83 65c20-16 43-13 58 4" fill="none" stroke="#f6bd56" strokeWidth="10" strokeLinecap="round" /></svg></div>, { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
