"use client";

import type { ComponentProps, ReactNode } from "react";
import { NavigationIntentLink, useNavigationCoordinator } from "@/components/navigation/navigation-coordinator";

type PendingNavigationLinkProps = ComponentProps<typeof NavigationIntentLink> & { children: ReactNode; pendingLabel?: string; navigationSource?: "bottom-nav" | "place-card" | "back" | "programmatic" };

export function PendingNavigationLink({ children, pendingLabel = "加载中…", onClick, navigationSource = "programmatic", ...props }: PendingNavigationLinkProps) {
  const { navigation } = useNavigationCoordinator();
  const href = typeof props.href === "string" ? props.href : String(props.href);
  const pending = navigation?.toRoute === href && (navigation.status === "pending" || navigation.status === "shell-visible" || navigation.status === "intent");
  return <NavigationIntentLink {...props} href={href} source={navigationSource} onClick={(event) => { onClick?.(event); }}>
    {children}
    {pending && <span className="pending-link-status" role="status" aria-live="polite">{pendingLabel}</span>}
  </NavigationIntentLink>;
}
