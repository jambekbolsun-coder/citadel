import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { SwRegister } from "@/components/pwa";
import "./globals.css";

const ui = Manrope({ variable: "--font-ui", subsets: ["latin", "cyrillic"] });
const display = Unbounded({ variable: "--font-display-face", subsets: ["latin", "cyrillic"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Цитадель", template: "%s · Цитадель" },
  description: "Операционная платформа SMM KADR",
  applicationName: "Цитадель",
  appleWebApp: { capable: true, title: "Цитадель", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101a17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${ui.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('citadel.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
