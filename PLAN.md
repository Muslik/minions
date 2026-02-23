🚀 FINAL MASTER PLAN (v1.0)

AI Engineering Orchestrator + Frontend Lab
Контекст: Orchestrator на VPS, корпоративный Bitbucket Server через VPN, Jira без repo-поля, Telegram сообщения “человеческим языком”, OpenClaw уже поднят.

1) Принципы (обязательные требования)

Strict Ticket Policy

Никакого кодинга/исследования без Ticket (Jira URL или ID).

Если тикета нет — OpenClaw создаёт.

Main Agent OpenClaw должен быть свободен

OpenClaw никогда не выполняет long-running работу.

Он не клонирует репы, не запускает тесты, не держит state workflow.

Он только:

принимает сообщения/кнопки

создаёт тикет

запускает/резюмирует процесс в Orchestrator

показывает статусы

Orchestrator — единственная фабрика исполнения

Только Orchestrator:

держит thread_id + чекпоинты

управляет Docker

имеет доступ к Git/Bitbucket

хранит артефакты и логи

Изоляция задач

Каждая задача = отдельный thread_id + отдельный workspace (worktree) + отдельные Docker workers.

Human-in-the-loop

Перед любым кодом — план и approve.

Side effects (git push/PR) только после approve и успешной валидации.

Ограничение итераций

Self-fix loop: максимум 2

Coder↔Reviewer loop: максимум 2

Если не договорились — эскалация в Telegram.

Ресурсы VPS

Swap 4–8GB + Docker resource limits + concurrency control.

2) Инфраструктура (VPS)

VPS: 4 vCPU, 8GB RAM, 200GB NVMe.

2.1 Swap (DevOps шаг №1)

Создать swapfile 4–8GB.

Цель: избежать OOM при pnpm install/build/test в контейнерах.

2.2 Директории Orchestrator
/srv/orchestrator/
  app/                      (код)
  data/                     (sqlite или конфиги)
  artifacts/<thread_id>/    (plan.md, report.md, logs, patch, figma assets)
  repos/<repo_hash>/        (git mirror cache, bare)
  workspaces/<ticket_id>/   (git worktree per task)
  cache/                    (pnpm store/cache опционально)
  secrets/                  (ssh/vpn/bitbucket creds)
2.3 VPN доступ (обязателен)

Orchestrator должен иметь постоянный VPN-туннель к корпоративной сети (Bitbucket Server + Jira/Confluence).

3) Компоненты и обязанности
3.1 OpenClaw (уже есть на VPS) — “Dispatcher/UI”

Что делает:

принимает человеческий текст в Telegram

извлекает Jira ID/URL из текста

если тикета нет → create_jira_ticket

intent classification:

research (разобраться) vs coding (починить/сделать)

вызывает Orchestrator API:

start_research(ticket_url)

start_coding(ticket_url)

resume(...) по inline кнопкам

показывает:

статус

план

логи/результат

PR ссылку

Что НЕ делает:

git clone

docker

langgraph

тесты/линтеры

хранение workflow состояния

Локальный UI-стейт OpenClaw (минимум):

pending_revision[chat_id] = { thread_id, expires_at } (для 2-шагового revise)

Это обеспечивает, что main агент OpenClaw свободен: он мгновенно отрабатывает апдейты и не блокируется.

3.2 Orchestrator (новый сервис) — “Factory”

Технологии:

Node.js + TypeScript

effect.ts (ресурсы, семафоры, ретраи, типовые ошибки)

LangGraph JS (workflow + checkpoint + interrupt)

dockerode (эфемерные контейнеры)

SQLite → Postgres позже

Git CLI + Bitbucket Server REST API (PR)

Что делает:

получает ticket_url

Hydration:

Jira fetch

Confluence fetch (если найдено)

Figma fetch (если есть ссылки/требуется)

вычисляет repo_url/target_branch через Knowledge Registry

Repo management:

ensureMirror(repo_url) (clone --mirror один раз)

worktree add per ticket

запускает Docker workers

пишет артефакты + логи

уведомляет OpenClaw о статусах (через internal notify endpoint)

3.3 Execution Environment (Docker workers) — “Compute plane”

Worker types:

Architect (read-only)

Coder (rw)

Validator (heavy)

Reviewer (read-only, clean context)

Ограничения:

Architect/Reviewer: 1 CPU / 1GB, network=none

Coder: 2 CPU / 3–4GB

Validator: 2 CPU / 4GB, heavy semaphore=1

4) Knowledge System (Jira ↔ Repo mapping)

Потому что в Jira нет поля repo_url.

4.1 Knowledge Registry (source of truth)

Файл в Orchestrator, например:
/srv/orchestrator/app/config/knowledge-registry.yaml

Содержит:

jira.baseUrl

правила определения проекта/репозитория:

по projectKey

по components

по labels

репозитории Bitbucket Server:

ssh clone url

projectKey/repoSlug (для PR API)

default target branch

fallback правила

политика безопасности/лимитов (max loops, allowed commands fallback)

4.2 Как определяется repo для тикета

парсинг ссылок в Jira описании (если там есть Bitbucket)

если нет — применяем knowledge-registry.yaml по projectKey/components/labels

если не найдено — Orchestrator останавливается и просит OpenClaw запросить у тебя “какой репо?” (эскалация)

5) Флоу “человеческий текст → PR”
5.1 Ты пишешь в Telegram

Пример:

“AVIA-8842: почини белый экран на оплате. Скорее всего raw payload.”

5.2 OpenClaw

извлекает AVIA-8842 или ссылку

intent → coding

вызывает Orchestrator: start_coding(ticket_url)

5.3 Orchestrator (LangGraph CodingGraph)

Node 1: Hydration (host, deterministic)

Jira fetch + извлечение контекста

Knowledge Registry → repo_url/branch

ensureMirror(repo_url) + fetch

worktree add /workspaces/AVIA-8842

загрузка AGENTS.md/KNOWLEDGE_BASE.md если есть

парсинг .agent-config.yaml

Node 2: Architect (docker, RO)

генерирует plan.md + plan_preview

Node 3: HITL interrupt

Orchestrator → OpenClaw notify: “покажи план + кнопки”

ожидает resume

Node 4: Coder (docker, RW)

реализация по плану

атомарные коммиты

Node 5: Validation (docker, heavy)

команды строго из .agent-config.yaml

fail → вернуть логи coder’у (max 2)

Node 6: Reviewer (docker, RO, clean ctx)

проверяет diff на соответствие правилам

спор max 2 итерации, потом эскалация

Node 7: Finalize (host)

squash/rebase

push ветки

создать PR в Bitbucket Server

notify OpenClaw: PR link + summary

Cleanup

worktree remove (после PR)

artifacts остаются

6) Research flow (без кода)

start_research(ticket_url):

Hydration (host)

Research worker (docker RO)

report.md → Telegram

Никаких коммитов, никаких PR.

7) Telegram UX (inline + “main agent свободен”)
7.1 Статусы

OpenClaw показывает:

“Hydrating… / Planning… / Awaiting approval… / Coding… / Validating… / Reviewing… / PR created…”

7.2 Inline approve/cancel/revise

✅ Approve → resume approve_plan

🛑 Cancel → resume cancel

✏️ Request changes → OpenClaw запрашивает текст → resume revise_plan(comment)

Важно: OpenClaw не ждёт выполнения — он мгновенно подтверждает callback и продолжает обслуживать чат.

8) MSW Frontend Testing Lab (встроено в требования)
Цель

Стабильные состояния UI без сотен JSON.

Стандарт команды:

Builders по URL query params

Raw override: ?rawMock=true + __mocks__/raw_payload.json

Hash tools: tool:encode-hash

Где лежит знание:

KNOWLEDGE_BASE.md в репозитории проекта.

Как используется агентами:

Coder/Validator могут запускать Playwright smoke на нужном URL.

9) План реализации (по шагам, без интеграции с OpenClaw сначала)
Phase 0 — Ops

VPN туннель

swap

папки /srv/orchestrator/*

секреты (ssh ключ к Bitbucket, jira creds)

Phase 1 — Orchestrator MVP (LangGraph first)

сервис на effect.ts + HTTP API

SQLite threads/runs/artifacts/audit

CodingGraph: Hydration → Architect → interrupt

Knowledge Registry v0

mirror + worktree

Docker architect-worker

Phase 2 — Resume + basic notifications

resume approve/cancel/revise

internal notify endpoint (orchestrator→openclaw) или файловые нотификации для теста

Phase 3 — Full factory

coder worker

validation loop max 2

reviewer loop max 2

finalize: push + PR Bitbucket Server

Phase 4 — Integration with OpenClaw

OpenClaw подключает вызовы Orchestrator

inline approve/cancel/revise UX

OpenClaw остаётся свободным (только диспетчер/кнопки)

10) Чёткий ответ на “каждая задача — сабагент?”

Нет.
Каждая задача — это thread_id в Orchestrator.
OpenClaw не запускает отдельные “тяжёлые сабагенты” на своей стороне.

11) Definition of Done (готово, когда)

Ты кидаешь Jira URL/ID в телегу человеческим языком

OpenClaw запускает Orchestrator

Приходит план + inline approve

После approve → код меняется, тесты/линтеры проходят

Создаётся PR в Bitbucket Server

Link PR приходит в Telegram

OpenClaw main агент всё время свободен (не блокируется процессом)

Workspace удалён, artifacts сохранены
