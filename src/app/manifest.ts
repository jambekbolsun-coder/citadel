import type { MetadataRoute } from "next";
import { icon, maskable } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "SMM KADR",
    short_name: "SMM KADR",
    description: "SMM KADR — проекты, команда, клиенты и заявки агентства",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b1640",
    theme_color: "#1845d2",
    lang: "ru",
    icons: [
      { src: icon(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: maskable(192), sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: maskable(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
