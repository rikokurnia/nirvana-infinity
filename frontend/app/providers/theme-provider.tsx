"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Class-based theming: next-themes adds `.light` / `.dark` to <html>, which
// flips the CSS variables defined in globals.css. Defaults to dark (the brand
// look) but respects the OS preference and persists the user's choice.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
