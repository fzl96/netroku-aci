// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Netroku ACI",
    template: "%s · Netroku ACI",
  },
  description:
    "Cisco ACI fabric management — endpoints, EPGs, bridge domains, static ports, and interface selectors.",
  applicationName: "Netroku ACI",
  authors: [{ name: "Furina" }],
  icons: { icon: "/favicon.ico" },
};

/** Inline script that runs before first paint — prevents theme flash. */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="h-full font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
