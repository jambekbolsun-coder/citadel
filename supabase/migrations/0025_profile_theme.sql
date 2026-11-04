-- 0025 · Цветные темы (docs/THEMES_PLAN.md): тема хранится в профиле, допустимы только темы из списка.
-- Только добавление ограничения; на 04.11.2026 у всех профилей theme = 'system', данные не меняются.
-- Список совпадает с src/lib/themes.ts (THEME_KEYS).
alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('system','light','dark','pink','violet','neon','sun')) not valid;
alter table public.profiles validate constraint profiles_theme_check;
