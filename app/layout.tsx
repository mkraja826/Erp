import type { Metadata } from "next";
import "./globals.css";
import "./erp-practice.css";
import "./erp-shell.css";
import "./procurement-flow.css";
import "./microlearning.css";
import "./mobile-v2.css";
import "./worklab-v2.css";
import "./evidence-v2.css";

export const metadata: Metadata = {
  title: "ERP Edu | Learn SAP by Doing",
  description:
    "A practical SAP learning platform with AI guidance, verified practice, and simulated work experience.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
