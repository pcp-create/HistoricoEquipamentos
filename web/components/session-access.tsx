"use client";
import { createContext, useContext } from "react";
const SessionAccess = createContext({ admin: false, displayName: "", modules: [] as string[] });
export function SessionAccessProvider({ access, children }: { access: { admin: boolean; displayName: string; modules: string[] }; children: React.ReactNode }) {
  return <SessionAccess.Provider value={access}>{children}</SessionAccess.Provider>;
}
export function useSessionAccess() { return useContext(SessionAccess); }
