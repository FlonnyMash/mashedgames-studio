import { APP_DISPLAY_NAME } from "@mashedgames/shared";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { LayoutGuard } from "@/components/shell/LayoutGuard";
import { brandLogoSrc } from "@/lib/brand-logo-src";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description:
    "Build and configure branded game templates with Mashed Games Studio",
  icons: {
    icon: [{ url: brandLogoSrc(), type: "image/png" }],
    apple: brandLogoSrc(),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#fafafa" }}
    >
      <body
        className="flex h-full flex-col overflow-hidden font-sans antialiased text-zinc-900"
        style={{ backgroundColor: "#fafafa" }}
      >
        <LayoutGuard>{children}</LayoutGuard>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
