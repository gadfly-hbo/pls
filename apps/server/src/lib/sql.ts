export function placeholders(length: number): string {
  return Array.from({ length }, () => "?").join(",");
}
