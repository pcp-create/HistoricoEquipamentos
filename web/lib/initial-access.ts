import "server-only";
import { cookies } from "next/headers";
import { authRequest } from "./auth";
import { accessRecord } from "./admin-store";
import { userDisplayName } from "./user-display-name";

// Server rendering must not refresh sessions: cookie writes belong to route handlers.
// Only verified identity and the current access record can expose the admin shortcut.
export async function initialSessionAccess() {
  return resolveInitialSession((await cookies()).get("m8-access")?.value);
}

export async function resolveInitialAdmin(token: string | undefined, request = authRequest, lookup = accessRecord) {
  return (await resolveInitialSession(token, request, lookup)).admin;
}
export async function resolveInitialSession(token: string | undefined, request = authRequest, lookup = accessRecord) {
  const empty = { admin: false, displayName: "" };
  if (!token) return empty;
  try {
    const response = await request("user", undefined, token);
    if (!response.ok) return empty;
    const user = await response.json();
    if (!user.id || user.is_anonymous || !user.email_confirmed_at || typeof user.email !== "string") return empty;
    const access = await lookup(user.email);
    return { admin: access?.enabled === true && access.role === "admin", displayName: access?.enabled === false ? "" : access?.display_name || userDisplayName(user) };
  } catch { return empty; }
}
