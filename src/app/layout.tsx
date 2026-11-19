import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delainah | Agriculture Platform",
  description: "Agriculture workspace for farmers, investors, field teams, and administrators",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
