export type BinaryTheme = "light" | "dark";

export function nextBinaryTheme(theme: string | undefined): BinaryTheme {
  return theme === "dark" ? "light" : "dark";
}
