import type { Metadata } from "next";
import "./globals.css";
import { APP } from "@/lib/config";

export const metadata: Metadata = {
  title: APP.name,
  description:
    "AI-powered global investment research and portfolio-analysis tool. Paper investing only. Not investment advice.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
