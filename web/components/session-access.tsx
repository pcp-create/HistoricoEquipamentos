"use client";
import { createContext, useContext } from "react";
const SessionAccess = createContext({ admin: false, visitManager: false, displayName: "" });
export function SessionAccessProvider({ access, children }: { access: { admin: boolean; visitManager: boolean; displayName: string }; children: React.ReactNode }) {
  return <SessionAccess.Provider value={access}>{children}</SessionAccess.Provider>;
}
export function useSessionAccess() { return useContext(SessionAccess); }
