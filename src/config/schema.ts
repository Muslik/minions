import { z } from "zod";

export const ServerConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().default(3000),
});

export const DockerConfigSchema = z.object({
  socketPath: z.string().default("/var/run/docker.sock"),
  image: z.string(),
  registryPrefix: z.string().optional(),
});

export const StorageConfigSchema = z.object({
  dbPath: z.string(),
  artifactsDir: z.string(),
  reposDir: z.string(),
  workspacesDir: z.string(),
  promptsDir: z.string().default("config/prompts"),
  knowledgeRegistryPath: z.string().default("config/knowledge-registry.yaml"),
});

export const JiraConfigSchema = z.object({
  baseUrl: z.string(),
  token: z.string(),
});

export const BitbucketConfigSchema = z.object({
  baseUrl: z.string(),
  token: z.string(),
});

export const NotifierConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string(),
    chatId: z.string(),
  }),
});

export const ConfluenceConfigSchema = z
  .object({
    baseUrl: z.string(),
    token: z.string(),
  })
  .optional();

export const LoopConfigSchema = z
  .object({
    baseUrl: z.string(),
    token: z.string(),
  })
  .optional();

export const AgentRecursionLimitsSchema = z.object({
  clarify: z.number().int().positive().default(80),
  architect: z.number().int().positive().default(240),
  coder: z.number().int().positive().default(120),
  reviewer: z.number().int().positive().default(80),
});

export const AgentConfigSchema = z.object({
  model: z.string().default("gpt-5.3-codex"),
  authDir: z.string().default("~/.codex"),
  baseUrl: z.string().default("https://chatgpt.com/backend-api/codex"),
  recursionLimits: AgentRecursionLimitsSchema.default({}),
});

export const OrchestratorConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  docker: DockerConfigSchema,
  storage: StorageConfigSchema,
  jira: JiraConfigSchema,
  bitbucket: BitbucketConfigSchema,
  notifier: NotifierConfigSchema,
  agent: AgentConfigSchema,
  confluence: ConfluenceConfigSchema,
  loop: LoopConfigSchema,
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type DockerConfig = z.infer<typeof DockerConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type BitbucketConfig = z.infer<typeof BitbucketConfigSchema>;
export type NotifierConfig = z.infer<typeof NotifierConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentRecursionLimits = z.infer<typeof AgentRecursionLimitsSchema>;
export type ConfluenceConfig = z.infer<typeof ConfluenceConfigSchema>;
export type LoopConfig = z.infer<typeof LoopConfigSchema>;
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;
