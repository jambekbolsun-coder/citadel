// Цитадель — рассылка Web Push. Вызывается только из базы (pg_net) с секретом из Vault.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Item = { id: string; title: string; body: string | null; priority: string; url: string; subs: Sub[] | null };
type Config = { secret: string | null; public: string | null; private: string | null; subject: string };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function config(): Promise<Config> {
  const { data, error } = await sb.rpc("push_config");
  if (error) throw error;
  return data as Config;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let cfg: Config;
  try {
    cfg = await config();
  } catch {
    return new Response("config unavailable", { status: 500 });
  }
  if (!cfg.secret || !safeEqual(req.headers.get("x-dispatch-secret") ?? "", cfg.secret)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!cfg.public || !cfg.private) {
    const keys = webpush.generateVAPIDKeys();
    await sb.rpc("push_init_vapid", { p_public: keys.publicKey, p_private: keys.privateKey });
    cfg = await config();
  }
  webpush.setVapidDetails(cfg.subject, cfg.public!, cfg.private!);

  const body = await req.json().catch(() => ({}));
  if (body?.selftest) {
    // Проверка шифрования без отправки: подписка с ключами, сгенерированными на месте
    const { createECDH, randomBytes } = await import("node:crypto");
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/selftest", keys: { p256dh: ecdh.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") } };
    try {
      const d = webpush.generateRequestDetails(sub, JSON.stringify({ title: "selftest" }));
      return Response.json({ selftest: "ok", bytes: (d.body as Uint8Array).length, vapid: d.headers.Authorization?.startsWith("vapid ") });
    } catch (e) {
      return Response.json({ selftest: "error", message: String(e) }, { status: 500 });
    }
  }

  let sent = 0;
  let failed = 0;
  for (let round = 0; round < 4; round++) {
    const { data, error } = await sb.rpc("push_claim", { p_limit: 50 });
    if (error) return Response.json({ error: error.message, sent }, { status: 500 });
    const batch = (data ?? []) as Item[];
    if (batch.length === 0) break;
    await Promise.all(
      batch.map(async (n) => {
        const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url, tag: n.id });
        const gone: string[] = [];
        let ok = 0;
        await Promise.all(
          (n.subs ?? []).map(async (s) => {
            try {
              await webpush.sendNotification(s, payload, {
                TTL: 86400,
                urgency: n.priority === "critical" || n.priority === "high" ? "high" : "normal",
              });
              ok++;
            } catch (e) {
              const code = (e as { statusCode?: number }).statusCode;
              if (code === 404 || code === 410) gone.push(s.endpoint);
            }
          }),
        );
        if (ok) sent++;
        else failed++;
        await sb.rpc("push_result", { p_id: n.id, p_ok: ok > 0, p_gone: gone });
      }),
    );
  }
  return Response.json({ sent, failed });
});
