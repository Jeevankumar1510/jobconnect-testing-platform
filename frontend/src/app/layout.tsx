import type { Metadata } from "next";

import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobConnect — Find work that moves you",
  description:
    "Discover thoughtful opportunities, apply with confidence, and build your next chapter with JobConnect.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SiteHeader />
          {children}
          <footer className="site-footer">
            <div className="footer-inner">
              <span className="footer-brand">
                job<span className="brand-accent">connect</span>
              </span>
              <span>Good work starts with a connection.</span>
              <span>© 2026 JobConnect</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
