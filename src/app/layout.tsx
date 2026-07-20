import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BrandingBootstrap } from "@/components/branding-bootstrap";
import { ErrorBoundary } from "@/components/error-boundary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Watershed Capital — Banking Governance Platform",
  description:
    "Enterprise banking platform: 20-state loan workflow, 8-snapshot audit trail, MCC committee, treasury, accounting.",
  icons: {
    icon: "/watershed-logo.png",
  },
};

// Inline script that runs before hydration to apply the persisted theme.
// This prevents a flash of the wrong theme and avoids hydration mismatches
// by setting the `dark` class on <html> before React mounts.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('watershed-banking');
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed.state && parsed.state.theme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} antialiased bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100`}
      >
        <BrandingBootstrap />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
