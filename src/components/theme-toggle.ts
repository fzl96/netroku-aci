export type BinaryTheme = "light" | "dark";

export function nextBinaryTheme(theme: string | undefined): BinaryTheme {
  return theme === "dark" ? "light" : "dark";
}

export type ThemeTogglePresentation = {
  icon: "sun" | "moon";
  label: string;
  nextTheme: BinaryTheme;
};

export function themeTogglePresentation(
  theme: string | undefined,
  mounted: boolean,
): ThemeTogglePresentation | null {
  if (!mounted) return null;

  const activeTheme: BinaryTheme = theme === "dark" ? "dark" : "light";

  return {
    icon: activeTheme === "dark" ? "sun" : "moon",
    label:
      activeTheme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode",
    nextTheme: nextBinaryTheme(activeTheme),
  };
}
