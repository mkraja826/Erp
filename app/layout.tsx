import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./erp-practice.css";
import "./erp-shell.css";
import "./procurement-flow.css";
import "./microlearning.css";
import "./mobile-v2.css";
import "./worklab-v2.css";
import "./evidence-v2.css";
import "./public-v2.css";

const description =
  "A practical SAP learning platform with AI guidance, verified practice, simulated work experience, and job-readiness evidence.";

export const metadata: Metadata = {
  applicationName: "ERP Edu",
  title: {
    default: "ERP Edu | Learn SAP by Doing",
    template: "%s | ERP Edu",
  },
  description,
  keywords: [
    "SAP learning",
    "SAP MM training",
    "ERP training",
    "SAP practice",
    "procure to pay",
    "job readiness",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "ERP Edu",
    title: "ERP Edu | Learn SAP by Doing",
    description,
  },
  twitter: {
    card: "summary",
    title: "ERP Edu | Learn SAP by Doing",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fb",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
