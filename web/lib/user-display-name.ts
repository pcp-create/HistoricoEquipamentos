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

export function userInitials(name: string): string {
  const value = name.trim();
  if (!value) return "?";
  if (value.includes("@")) return value.slice(0, 2).toLocaleUpperCase("pt-BR");
  const parts = value.split(/\s+/);
  return (Array.from(parts[0])[0] + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : "")).toLocaleUpperCase("pt-BR");
}
