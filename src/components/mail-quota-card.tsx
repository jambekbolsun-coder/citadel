"use client";
import { MAIL_LIMIT_PER_HOUR, freeSlots, mmss, type EmailQuota } from "@/lib/email-quota";
import { useEmailQuota } from "@/components/auth-forms";

/** «Команда → Добавить сотрудника»: живой таймер лимита писем и правила добавления сотрудников. */
export function MailQuotaCard({ quota: initial }: { quota: EmailQuota | null }) {
  const { q, left } = useEmailQuota(initial);
  const free = freeSlots(q);
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-4 md:p-5" aria-labelledby="mail-quota-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mail-quota-title" className="font-semibold">Правила добавления сотрудников</h2>
          <p className="mt-1 text-sm text-muted">Письма для подтверждения email отправляет встроенная почта: не больше {MAIL_LIMIT_PER_HOUR} писем в час на всё приложение.</p>
        </div>
        <div className={left > 0 ? "rounded-xl bg-warn-soft px-4 py-2 text-warn" : "rounded-xl bg-good-soft px-4 py-2 text-good"} role="status" aria-live="polite">
          {left > 0 ? (
            <>
              <div className="text-xs font-semibold">Следующий сотрудник — через</div>
              <div className="font-display text-2xl font-extrabold tabular-nums">{mmss(left)}</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold">Можно добавить сейчас</div>
              <div className="font-display text-2xl font-extrabold">{free} из {MAIL_LIMIT_PER_HOUR}</div>
            </>
          )}
        </div>
      </div>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
        <li><b>Не больше {MAIL_LIMIT_PER_HOUR} сотрудников в час.</b> Третьего добавляйте, когда таймер покажет «Можно добавить сейчас».</li>
        <li><b>По одному.</b> Отправьте ссылку первому сотруднику и дождитесь, пока он нажмёт «Создать аккаунт», — потом следующему.</li>
        <li><b>Сотрудник нажимает «Создать аккаунт» один раз.</b> Письмо приходит в течение 1–3 минут; если нет — сначала «Спам» и «Промоакции», а не повторная отправка.</li>
        <li><b>Повторное письмо и «Забыли пароль?» тоже тратят письмо.</b> Не сбрасывайте пароли в тот час, когда добавляете сотрудников.</li>
        <li><b>Ссылку из письма открывать на том же телефоне.</b> Если открылась в приложении Gmail и попросила войти — email уже подтверждён: сотрудник входит со своим email и паролем.</li>
        <li><b>Если таймер идёт</b> — у сотрудника на странице приглашения тоже показан таймер, кнопка заработает сама.</li>
      </ol>
    </section>
  );
}
