"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep module handlers and permissions local while sharing their visual position. */
export default function ModuleHeaderActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTarget(document.getElementById("module-header-actions"));
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!target) return <>{children}</>;
  return createPortal(<div className="module-header-action-group">{children}</div>, target);
}
