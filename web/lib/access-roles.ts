export function canManageVisits(role: unknown) {
  return role === "admin" || role === "manager";
}
