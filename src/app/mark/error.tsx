"use client";
import { RouteError } from "@/components/shell/route-loading";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <RouteError label="记一顿暂时没有打开" reset={reset} />; }
