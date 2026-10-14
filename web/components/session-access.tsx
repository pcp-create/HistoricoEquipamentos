"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clearApiCache } from "@/lib/client-api-cache";
import { userModules } from "@/lib/module-access";

type Access = { admin: boolean; displayName: string; modules: string[]; mustChangePassword?: boolean; resolved?: boolean };
const SessionAccess = createContext<Access & { checking: boolean; error: string; retry: () => void }>({
  admin: false, displayName: "", modules: [], checking: true, error: "", retry: () => {},
});
export function SessionAccessProvider({ access, children }: { access: Access; children: React.ReactNode }) {
  const [current, setCurrent] = useState(access);
  const [checking, setChecking] = useState(!access.resolved);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const pathname = usePathname();
  const resolved = useRef(access.resolved === true);
  useEffect(() => {
    // A failed server lookup must not replace permissions recovered by the heartbeat.
    if (access.resolved) {
      setCurrent(access);
      resolved.current = true;
      setChecking(false);
      setError("");
    }
  }, [access]);
  useEffect(() => {
    if (pathname === "/login" || pathname === "/trocar-senha" || access.mustChangePassword) return;
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    const check = async () => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      if (!resolved.current) setChecking(true);
      try {
        // Route handlers can renew expired sessions and return fresh module permissions.
        const response = await fetch("/api/activity", { method: "POST", cache: "no-store", signal: controller.signal });
        if (stopped) return;
        if (response.status === 401) {
          clearApiCache();
          window.location.assign("/login");
          return;
        }
        const data = await response.json();
        if (response.status === 403 && data.mustChangePassword) {
          clearApiCache();
          window.location.assign("/trocar-senha");
          return;
        }
        if (!response.ok || !Array.isArray(data.modules)) throw new Error("Access lookup failed");
        const meta = document.querySelector<HTMLMetaElement>('meta[name="app-cache-scope"]');
        if (meta && typeof data.cacheScope === "string" && meta.content !== data.cacheScope) {
          clearApiCache();
          meta.content = data.cacheScope;
        }
        setCurrent({ admin: data.admin === true, displayName: data.displayName || "", modules: userModules(data.modules), resolved: true });
        resolved.current = true;
        setError("");
      } catch {
        if (!stopped) setError("Não foi possível atualizar as permissões. Tente novamente.");
      } finally {
        busy = false;
        if (!stopped) setChecking(false);
      }
    };
    void check();
    const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pathname, access.mustChangePassword, attempt]);
  return <SessionAccess.Provider value={{ ...current, checking, error, retry }}>{children}</SessionAccess.Provider>;
}
export function useSessionAccess() { return useContext(SessionAccess); }
