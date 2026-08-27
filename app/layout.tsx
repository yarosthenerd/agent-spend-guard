import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Spend-Guard",
  description: "Give your trading agent an allowance, not your wallet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
