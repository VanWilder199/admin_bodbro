# admin_bodbro — админка «Подбор»

Фронтенд-монорепо админки, перенесённое из `backend-podbor/frontend`
(только админ-часть: `apps/admin` + shared-пакет `packages/ui`).

## Структура

```
apps/admin       — Vite + React 19 админка
packages/ui      — общий UI-пакет (компоненты, тема, форматирование)
```

## Требования

- Node.js **>=22.12** (см. `.nvmrc`, версия `22`)
- npm (workspaces)

## Установка

```bash
nvm use          # или укажи версию: nvm use 22
npm install
```

## Запуск

```bash
npm run dev        # dev-сервер на http://localhost:5174
npm run dev:mocks  # dev с мок-данными (VITE_API_MOCKS=1)
```

Прокси `/api` в dev направляется на `http://localhost:8080` (см. `apps/admin/vite.config.ts`).

## Проверки

```bash
npm run typecheck  # tsc --noEmit по всем workspace
npm run build      # tsc + vite build
npm run test       # vitest (549 тестов, 30 файлов)
```

## Заметки

- 2 moderate vulnerabilities в `npm audit` — предсуществующие, из корня исходника.
- Node 20 в системе не подходит (engines требует >=22.12) — используй nvm.