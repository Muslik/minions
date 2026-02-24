# Minions

Autonomous coding orchestrator. Takes a Jira ticket URL, produces a pull request.

Minions runs a LangGraph state machine that plans, codes, validates, and reviews changes — then pushes a PR to Bitbucket. Human stays in the loop at the plan-approval stage.

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              LangGraph (outer)              │
                         │                                             │
  POST /runs/coding ───► hydrate ──► architect ──► await_approval      │
                         │                             │  │  │         │
                         │               approve ◄─────┘  │  │         │
                         │               revise  ─────────┘  │         │
                         │               cancel  ────────────┘──► END  │
                         │                │                            │
                         │          coder ──► validate ──► reviewer    │
                         │            ▲          │  ▲         │        │
                         │            │          │  │         │        │
                         │            └──error───┘  └──REJECTED        │
                         │                                    │        │
                         │                              APPROVED       │
                         │                                    │        │
                         │                             finalize ──► cleanup ──► END
                         │                                             │
                         │          (escalate ──► cleanup if max loops) │
                         └─────────────────────────────────────────────┘
```

### Nodes

| Node | What it does |
|---|---|
| **hydrate** | Fetches Jira issue, resolves repo via knowledge registry, creates git worktree, scrapes Confluence/Loop links from ticket |
| **architect** | ReAct agent (read-only tools). Produces a markdown implementation plan |
| **await_approval** | HITL interrupt. Waits for `POST /runs/:id/resume` with `approve` / `revise` / `cancel` |
| **coder** | ReAct agent (read+write tools, bash). Implements the plan, commits to worktree |
| **validate** | Runs validation commands (`npm test`, etc.) inside Docker |
| **reviewer** | ReAct agent (read-only tools). Outputs `APPROVED` or `REJECTED: <feedback>` |
| **finalize** | `git push`, creates Bitbucket PR, notifies webhook |
| **cleanup** | Removes git worktree |
| **escalate** | Notifies webhook, marks run as escalated |

### Agent nodes (architect, coder, reviewer)

Agent nodes run in-process via LangChain, not inside Docker:

```
AgentFactory.runAgent(role, worktreePath, context)
  │
  ├── OAuthTokenProvider.getAccessToken()   ← fresh OpenAI token
  ├── new ChatOpenAI({ model, apiKey })     ← per-invocation
  ├── createToolsForRole(role, worktreePath) ← scoped tools
  ├── loadTemplate + renderTemplate          ← prompt from config/prompts/
  ├── createReactAgent({ llm, tools })       ← @langchain/langgraph/prebuilt
  └── .invoke(messages, { recursionLimit })  ← clarify=80, architect=240, coder=120, reviewer=80 (configurable)
```

**Tool sets by role:**

| Role | Tools |
|---|---|
| architect, reviewer | `read_file`, `list_directory`, `search_files`, `grep` |
| coder | all above + `write_file`, `bash` |

All tools are scoped to the git worktree with a path-traversal guard. Most tool output is truncated to 8 KB; `read_file` auto-chunks large files.

### Validation node

Validation still runs inside Docker using the image from `config.docker.image`. The worktree is mounted read-only and each command from `.minions.yaml` is executed sequentially.
During validation, Minions copies `/workspace` into an internal writable sandbox (`/tmp/workspace`) and runs `pnpm install --frozen-lockfile --ignore-scripts` there before executing validation commands.
If `package.json` contains an exact `engines.node` version (`x.y.z`), validator switches Node with `fnm` before install/checks and emits detailed validation runtime/bootstrap/command events to the run log.

## Project structure

```
src/
├── api/                    # Hono HTTP server
│   ├── server.ts           # App factory, route mounting
│   └── routes/
│       ├── runs.ts         # POST /coding, GET /, GET /:id, DELETE /:id
│       ├── resume.ts       # POST /:id/resume, POST /:id/cancel
│       ├── artifacts.ts    # GET /:id/artifacts/:name
│       └── health.ts       # GET /health, GET /info
├── config/
│   ├── schema.ts           # Zod schemas for orchestrator.yaml
│   └── loader.ts           # YAML + env var merge
├── domain/
│   ├── types.ts            # RunStatus, RunContext, JiraIssue, etc.
│   ├── state.ts            # LangGraph state annotation
│   ├── errors.ts           # Tagged error types (Effect)
│   └── constants.ts        # MAX_VALIDATION_LOOPS, WORKER_PROFILES
├── effect/
│   ├── runtime.ts          # Builds NodeDeps from config
│   ├── layers.ts           # Effect Context.Tag definitions
│   └── semaphores.ts       # Concurrency limits (reserved)
├── graph/
│   ├── coding.ts           # StateGraph wiring
│   ├── edges/routing.ts    # Conditional routing functions
│   └── nodes/              # One file per node
├── services/
│   ├── agent.ts            # AgentFactory — ChatOpenAI + ReAct
│   ├── auth.ts             # OAuthTokenProvider — reads ~/.codex/auth.json
│   ├── tools.ts            # LangChain tool definitions per role
│   ├── prompt.ts           # loadTemplate / renderTemplate
│   ├── docker.ts           # Dockerode wrapper (for validation)
│   ├── git.ts              # Mirror, worktree, push
│   ├── jira.ts             # Jira REST client
│   ├── bitbucket.ts        # Bitbucket PR creation
│   ├── confluence.ts       # Confluence page fetcher
│   ├── loop.ts             # Loop/Mattermost thread fetcher
│   ├── knowledge.ts        # Repo resolution from registry
│   ├── notifier.ts         # Webhook notifier
│   └── artifacts.ts        # File-based artifact storage
├── store/
│   ├── db.ts               # SQLite init (WAL mode)
│   ├── runs.ts             # RunStore CRUD
│   └── checkpoints.ts      # LangGraph checkpoint saver
└── index.ts                # Entrypoint
```

## Setup

### Prerequisites

- Node.js >= 20
- pnpm
- Docker (for validation node)
- OpenAI Codex CLI auth token (`codex login`)

### 1. Install dependencies

```sh
pnpm install
```

### 2. Authenticate with OpenAI

The agent nodes use OAuth tokens from the Codex CLI auth file. Run this once:

```sh
npx @openai/codex login --device-code
```

This creates `~/.codex/auth.json` with your `access_token` and `refresh_token`. The orchestrator refreshes tokens automatically (8h interval, matching Codex CLI behavior).

### 3. Configure

Copy and edit the env file:

```sh
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `ORCH_JIRA_BASE_URL` | Jira instance URL |
| `ORCH_JIRA_TOKEN` | Jira personal access token |
| `ORCH_BITBUCKET_BASE_URL` | Bitbucket instance URL |
| `ORCH_BITBUCKET_TOKEN` | Bitbucket personal access token |
| `ORCH_NOTIFIER_WEBHOOK_URL` | Webhook endpoint for status notifications |
| `ORCH_NOTIFIER_HMAC_SECRET` | HMAC secret for webhook signatures |

Optional:

| Variable | Default | Description |
|---|---|---|
| `ORCH_SERVER_PORT` | `3000` | HTTP server port |
| `ORCH_AGENT_MODEL` | `gpt-5.3-codex` | OpenAI model for agent nodes |
| `ORCH_AUTH_DIR` | `~/.codex` | Directory containing `auth.json` |
| `ORCH_AGENT_RECURSION_CLARIFY` | `80` | Max inner-agent recursion for clarify role |
| `ORCH_AGENT_RECURSION_ARCHITECT` | `240` | Max inner-agent recursion for architect role |
| `ORCH_AGENT_RECURSION_CODER` | `120` | Max inner-agent recursion for coder role |
| `ORCH_AGENT_RECURSION_REVIEWER` | `80` | Max inner-agent recursion for reviewer role |
| `ORCH_DOCKER_IMAGE` | — | Docker image for validation (set in YAML) |
| `ORCH_TELEGRAM_BOT_TOKEN` | — | Telegram bot token (required for polling and TG notifications) |
| `ORCH_TELEGRAM_CHAT_ID` | — | Telegram chat id (required for polling and TG notifications) |
| `ORCH_CONFLUENCE_BASE_URL` | — | Confluence instance (optional) |
| `ORCH_CONFLUENCE_TOKEN` | — | Confluence token |
| `ORCH_LOOP_BASE_URL` | — | Loop/Mattermost instance (optional) |
| `ORCH_LOOP_TOKEN` | — | Loop token |

All env vars override `config/orchestrator.yaml`. You can also edit the YAML directly.
If Telegram token/chat id are missing or invalid, Telegram polling and Telegram notifier channel are disabled.

### 4. Knowledge registry

Edit `config/knowledge-registry.yaml` to map your Jira projects to Bitbucket repos:

```yaml
projects:
  PROJ:
    default: "my-repo"

repos:
  my-repo:
    description: "Main application"
    branch: "develop"
```

### 5. Per-repo configuration

Create `.minions.yaml` in the root of target repositories:

```yaml
validation:
  commands:
    - "npm ci"
    - "npm test"
    - "npm run lint"

conventions: |
  - Use TypeScript strict mode
  - Follow existing naming patterns
```

If `.minions.yaml` is missing, Minions uses repo defaults when available.  
Current built-in fallback: `front-avia` -> `lint:eslint`, `lint:prettier`, `lint:stylelint`, `lint:circular`, `typecheck`, `dicts`, `test`.

### 6. Run

**Development:**

```sh
pnpm dev
```

**Production:**

```sh
pnpm build
pnpm start
```

**Docker:**

```sh
docker compose up --build
```

## API

### Create a coding run

```sh
curl -X POST http://localhost:3000/api/v1/runs/coding \
  -H "Content-Type: application/json" \
  -d '{
    "ticketUrl": "https://jira.example.com/browse/PROJ-123",
    "chatId": "chat-1",
    "requesterId": "user-1"
  }'
```

Response: `202 { "runId": "uuid" }`

The graph runs asynchronously. Poll the run status or wait for a webhook notification.

### Approve / revise / cancel a plan

```sh
# Approve
curl -X POST http://localhost:3000/api/v1/runs/{runId}/resume \
  -H "Content-Type: application/json" \
  -d '{ "action": "approve" }'

# Revise (re-plan)
curl -X POST http://localhost:3000/api/v1/runs/{runId}/resume \
  -H "Content-Type: application/json" \
  -d '{ "action": "revise", "comment": "Also handle edge case X" }'

# Cancel
curl -X POST http://localhost:3000/api/v1/runs/{runId}/cancel
```

### Check run status

```sh
curl http://localhost:3000/api/v1/runs/{runId}
```

### List runs

```sh
curl http://localhost:3000/api/v1/runs
curl http://localhost:3000/api/v1/runs?status=DONE
curl http://localhost:3000/api/v1/runs?chatId=chat-1&limit=10
```

### Get artifacts

```sh
curl http://localhost:3000/api/v1/runs/{runId}/artifacts/plan.md
```

### Health check

```sh
curl http://localhost:3000/health
```

## Run lifecycle

```
RECEIVED → HYDRATING → PLANNING → AWAITING_APPROVAL
                                         │
                            approve ──► CODING → VALIDATING → REVIEWING
                            revise  ──► PLANNING                │    │
                            cancel  ──► DONE              FINALIZING │
                                                              │  REJECTED → CODING
                                                            DONE
```

Maximum loops: 2 validation retries, 2 review retries. After that the run escalates.

## Testing

```sh
pnpm test
```

121 tests covering: config loading, routing logic, node isolation, artifact storage, knowledge resolution, prompt rendering, OAuth token refresh, tool path traversal, and role-based tool filtering.

## Prompt templates

Templates live in `config/prompts/`. They use `{{variableName}}` placeholders that get filled from the Jira issue and run context. Unknown variables are left as-is.

| Template | Used by |
|---|---|
| `architect.md` | architect node — system prompt for planning |
| `coder.md` | coder node — system prompt for implementation |
| `reviewer.md` | reviewer node — system prompt for code review |
