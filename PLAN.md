# План миграции админки в `admin_bodbro`

Цель: вынести админ-часть из монорепо `backend-podbor/frontend` в отдельную
репу `admin_bodbro` и корректно её инициализировать.

## Диагностика

- Админка (`apps/admin`) — Vite + React 19, жёстко зависит от shared-пакета
  `@podbor/ui` (105 импортов: `components/card`, `cell`, `ui/*`, `lib/format`,
  `ReportView`, `theme.css`). Без `packages/ui` не собирается.
- `apps/web`, `apps/inspector`, `bot`, `agent-tasks` — к админке не относятся,
  не переносятся.
- Репа `admin_bodbro` пустая (0 коммитов), ветка `main`, remote настроен.

## Решение

Оставить **монорепо**, но только из админ-частей: `apps/admin` + `packages/ui`
+ корневой workspace-конфиг. Так сохраняется сборка `@podbor/admin` → `@podbor/ui`
без переписывания импортов.

## Шаги (выполнено)

1. Создать корневой конфиг:
   - `package.json` (workspaces `apps/*`, `packages/*`; скрипты dev/build/typecheck/test)
   - `tsconfig.base.json` (копия из исходника)
   - `.nvmrc` = `22`
   - `.gitignore` (`node_modules/`, `dist/`, `*.tsbuildinfo`, `.vite/`)
2. Скопировать деревья через rsync, исключая `node_modules`, `dist`, `.vite`, `*.tsbuildinfo`:
   - `backend-podbor/frontend/apps/admin` → `apps/admin`
   - `backend-podbor/frontend/packages/ui` → `packages/ui`
3. `npm install` (Node 22.15.1) — 273 пакета, без ошибок.
4. Проверки:
   - `npm run typecheck` — чисто (admin + ui)
   - `npm run build` — успешно (vite, 3917 модулей)
   - `npm run test` — **549/549** тестов в 30 файлах
5. `README.md` (структура, требования, запуск) + этот `PLAN.md`.

## Замечания / риски

- Системный Node = v20.18 — не соответствует `engines: >=22.12`. Использовать
  nvm Node 22.15.1.
- `npm audit`: 2 moderate — предсуществующие в исходнике, не внесены миграцией.
- chunk-size warning (737 kB) у сборки — косметика, из исходника.
- В `vitest` stderr шумит ошибка `vaul` (`getTranslate`) на happy-dom — тесты
  при этом проходят (549/549).