import type { Metadata, Viewport } from "next";
import { Manrope, Montserrat } from "next/font/google";
import { SwRegister } from "@/components/pwa";
import "./globals.css";

const ui = Manrope({ variable: "--font-ui", subsets: ["latin", "cyrillic"] });
// Montserrat — шрифт надписи в логотипе SMM KADR; крупные заголовки приложения и сайта.
const display = Montserrat({ variable: "--font-display-face", subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "SMM KADR", template: "%s · SMM KADR" },
  description: "SMM KADR — маркетинг, который продаёт: контент, таргет, команда. Рабочее приложение агентства.",
  applicationName: "SMM KADR",
  appleWebApp: { capable: true, title: "SMM KADR", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1422" },
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
