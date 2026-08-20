export type Role = "admin" | "lead" | "tester";

export function canManageProject(role: Role) {
  return role === "admin" || role === "lead";
}

export function canDeleteProject(role: Role) {
  return role === "admin";
}

export function canManageDefects(role: Role) {
  return role === "admin" || role === "lead";
}
