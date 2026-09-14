export type AuthUser = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
};
export function userDisplayName(user: AuthUser): string {
  const metadata = user.user_metadata || {};
  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim())
      return value.trim().slice(0, 200);
  }
  return user.email;
}
