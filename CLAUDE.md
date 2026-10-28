# Цитадель — память проекта

Операционная PWA-платформа SMM KADR (Бишкек). Полное ТЗ: `docs/CITADEL_FULL_TZ.md`.

@AGENTS.md

## Стек
- Next.js 16 (App Router, `src/proxy.ts` вместо middleware), React 19, TypeScript, Tailwind v4.
- Supabase: Postgres + RLS, Auth, Storage, Realtime, Vault (секреты), pg_cron (напоминания).
- Деплой: Vercel ← GitHub `main`.

## Принципы (не нарушать)
- Права проверяются в БД (RLS + security definer RPC). UI только скрывает кнопки.
- Статусы материалов/задач/проектов меняются только RPC-функциями (`content_transition`, `task_transition`, `project_set_status`, `launch_project`); прямой UPDATE статуса блокируется триггером.
- Деньги — `bigint` в тыйынах (`*_minor`), парсинг через `parseMoney`. Никаких float.
- Подтверждённые платежи/расходы/начисления не редактируются: только сторно/корректировки.
- Время в БД — `timestamptz` UTC; в UI — Asia/Bishkek (`src/lib/format.ts`).
- Нет выдуманных цифр и фальшивых интеграций: если норматив не задан — «ёмкость не рассчитана».

## Структура
- `supabase/migrations/*.sql` — схема (применены к проекту `cdnveemxxgghhvrydtid`).
- `supabase/tests/business_rules.sql` — интеграционный тест правил п.27 (откатывается, ожидается `TEST OK`).
- `src/app/(public)`: `/`, `/privacy`; авторизация: `/login`, `/setup`, `/invite/[token]`, `/pending`, `/auth/*`.
- `src/app/app/**` — рабочее приложение, у каждого модуля `actions.ts` (server actions) + страницы.
- `src/lib/` — `auth.ts` (сессия и права), `actions.ts` (обёртка действий), `format.ts`, `labels.ts`, `data.ts`.

## Команды
`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run icons`

## Документация
`docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `docs/PERMISSIONS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TEST_PLAN.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md` — обновлять после каждого этапа.
