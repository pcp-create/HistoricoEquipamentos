import {canManageVisits} from "./access-roles";
import "server-only";
import { needsPasswordChange } from "./password-policy";
import { cookies } from "next/headers";
import { authRequest } from "./auth";
import { accessRecord } from "./admin-store";
import { userDisplayName } from "./user-display-name";

// Server rendering must not refresh sessions: cookie writes belong to route handlers.
// Only verified identity and the current access record can expose the admin shortcut.
export async function initialSessionAccess() {
  return resolveInitialSession((await cookies()).get("m8-access")?.value);
}

export async function resolveInitialAdmin(
  token: string | undefined,
  request = authRequest,
  lookup = accessRecord,
) {
  return (await resolveInitialSession(token, request, lookup)).admin;
}
export async function resolveInitialSession(
  token: string | undefined,
  request = authRequest,
  lookup = accessRecord,
) {
  const empty = { admin: false, visitManager: false, displayName: "", cacheScope: "" };
  if (!token) return empty;
  try {
    const response = await request("user", undefined, token);
    if (!response.ok) return empty;
    const user = await response.json();
    if (
      !user.id ||
      user.is_anonymous ||
      !user.email_confirmed_at ||
      typeof user.email !== "string"
    )
      return empty;
    const access = await lookup(user.email);
    if(access?.enabled !== false && needsPasswordChange(user))return {...empty,mustChangePassword:true};
    return {
      cacheScope:
        access?.enabled === false
          ? ""
          : user.id + ":" + (access?.role || "user"),
      admin: access?.enabled === true && access.role === "admin",
      visitManager: access?.enabled === true && canManageVisits(access.role),
      displayName:
        access?.enabled === false
          ? ""
          : access?.display_name || userDisplayName(user),
    };
  } catch {
    return empty;
  }
}
