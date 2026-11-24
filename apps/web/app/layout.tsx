import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kronicle — AI video studio",
  description: "Clean-room Kronicle replica for product learning and authorised research.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-full bg-bg font-sans antialiased">{children}</body>
    </html>
  );
}
