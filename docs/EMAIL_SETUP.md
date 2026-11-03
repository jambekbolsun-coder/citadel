# Письма SMM KADR через ваш Gmail (≈ 5 минут, делается один раз)

**Зачем.** Сейчас письма отправляет встроенная почта Supabase: всего несколько писем в час на весь проект.
3 ноября из-за этого 5 регистраций сотрудников подряд получили отказ `email rate limit exceeded`, и аккаунты не создались.
Через ваш Gmail можно отправлять до ~500 писем в сутки.

> Пароль приложения Gmail вводите **только вы** — его нельзя передавать в чат или кому-либо.
> Это не пароль от Gmail, а отдельный 16-значный ключ, который можно отозвать в любой момент.

## 1. Пароль приложения Gmail
1. Откройте https://myaccount.google.com/security → включите **Двухэтапную аутентификацию** (если ещё не включена).
2. Откройте https://myaccount.google.com/apppasswords
3. Название: `SMM KADR Supabase` → **Создать** → скопируйте 16 символов (пробелы можно не копировать).

## 2. Подключить Gmail в Supabase
Supabase → проект → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:

| Поле | Значение |
|---|---|
| Sender email | ваш Gmail (тот же, где создан пароль приложения) |
| Sender name | `SMM KADR` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | ваш Gmail полностью |
| Password | 16-значный пароль приложения из шага 1 |

**Save**.

## 3. Поднять лимит писем
**Authentication → Rate Limits → Rate limit for sending emails** → `100` в час → **Save**.
(Поле становится доступным только после шага 2.)

## 4. Адрес приложения
**Authentication → URL Configuration**:
- Site URL: `https://citadel-tawny.vercel.app`
- Redirect URLs: добавьте `https://citadel-tawny.vercel.app/**`

## 5. Русские письма (ссылка работает в любом браузере + код)
**Authentication → Emails → Templates**:
- **Confirm signup** — тема `Подтвердите email — SMM KADR`, текст — содержимое файла `supabase/templates/confirm-signup.html`.
- **Reset password** — тема `Смена пароля — SMM KADR`, текст — `supabase/templates/reset-password.html`.

Без этого шага всё тоже работает, но письма будут на английском, а ссылка из приложения Gmail
поведёт на экран входа (email при этом уже подтверждён — сотрудник просто входит паролем).

## Проверка
Пригласите сотрудника → он открывает ссылку → вводит email и пароль → видит «Письмо отправлено» →
нажимает кнопку в письме **или вводит код** → «Заполните профиль» → «Присоединиться» → вы утверждаете его в «Команде».
