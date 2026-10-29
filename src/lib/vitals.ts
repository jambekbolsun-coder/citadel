import { z } from "zod";

export const VITAL_NAMES = ["TTFB", "FCP", "LCP", "CLS", "INP", "route-shell", "route-ready"] as const;

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i;

/** Шаблон маршрута без идентификаторов, токенов и параметров запроса — замеры не привязываются к людям и записям. */
export function routeTemplate(pathOrUrl: string): string {
  let path = pathOrUrl;
  try {
    path = new URL(pathOrUrl, "http://x").pathname;
  } catch {
    return "/";
  }
  const out = path
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => (ID_SEGMENT.test(s) ? ":id" : s.toLowerCase().replace(/[^a-z0-9_-]/g, "")))
    .filter(Boolean);
  return ("/" + out.join("/")).slice(0, 120);
}

export const vitalSchema = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().min(0).max(599_999),
  rating: z.enum(["good", "needs-improvement", "poor"]).nullish(),
  route: z.string().max(200),
  nav: z.string().max(32).nullish(),
  standalone: z.boolean().optional(),
  width: z.number().int().min(0).max(10_000).nullish(),
  conn: z.string().max(16).nullish(),
});
export const vitalsBatch = z.array(vitalSchema).min(1).max(40);
export type Vital = z.infer<typeof vitalSchema>;
