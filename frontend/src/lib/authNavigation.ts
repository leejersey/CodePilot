export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value === "/auth/login" || value.startsWith("/auth/login?")) return "/";
  return value;
}
