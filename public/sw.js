// SMM KADR — service worker.
// Безопасная стратегия: кэшируются только статические ресурсы и офлайн-страница.
// Приватные ответы API, HTML страниц /app и запросы к Supabase НЕ кэшируются.
// При каждом релизе с новым оформлением увеличивайте VERSION — старые кеши удаляются при активации.
const VERSION = "smmkadr-v4";
const ICON = "/icons/smmkadr-192.png";
const STATIC = ["/offline.html", ICON];

self.addEventListener("install", (e) => {
  // Каждый файл отдельно: если один не скачался, новая версия всё равно установится
  // (раньше сбой addAll мог оставить на телефоне старый service worker со старыми иконками).
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(STATIC.map((u) => c.add(new Request(u, { cache: "reload" }))))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase и внешние запросы — мимо SW

  // Неизменяемая статика Next (имена с хешем) — cache-first. Иконки, manifest и логотипы НЕ кешируются здесь:
  // браузер всегда сверяет их с сервером, поэтому смена логотипа доходит до телефона сразу.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Навигация — только сеть; без сети — офлайн-страница (не выдаём устаревшие приватные данные)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

// Web Push: приходит и при закрытом приложении (отправляет edge-функция push-dispatch)
self.addEventListener("push", (e) => {
  let data = { title: "SMM KADR", body: "Новое уведомление", url: "/app/notifications" };
  try {
    data = { ...data, ...e.data.json() };
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: ICON,
      badge: ICON,
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app/notifications";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
