import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SlotWise · A clearer academic week", template: "%s · SlotWise" },
  description: "A university timetable and faculty leave recovery project. Sign in to a role-scoped local demo.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main-content" className="skip-link inline-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
