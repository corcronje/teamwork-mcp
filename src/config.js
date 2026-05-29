import { z } from "zod";

const envSchema = z.object({
  TEAMWORK_BASE_URL: z.string().url(),
  TEAMWORK_API_VERSION: z.string().default("v3"),
  TEAMWORK_API_TOKEN: z.string().min(1),
  TEAMWORK_AUTH_MODE: z.enum(["bearer", "basic_token_x"]).default("bearer"),
  TEAMWORK_READ_ONLY: z
    .string()
    .optional()
    .transform((v) => (v || "false").toLowerCase() === "true"),
  TEAMWORK_ALLOWED_PROJECT_IDS: z.string().optional(),
});

export function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Teamwork MCP configuration: ${message}`);
  }

  const cfg = parsed.data;
  const baseUrl = cfg.TEAMWORK_BASE_URL.replace(/\/+$/, "");
  const apiBase = `${baseUrl}/projects/api/${cfg.TEAMWORK_API_VERSION}`;

  const allowedProjectIds = (cfg.TEAMWORK_ALLOWED_PROJECT_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    baseUrl,
    apiBase,
    token: cfg.TEAMWORK_API_TOKEN,
    authMode: cfg.TEAMWORK_AUTH_MODE,
    readOnly: cfg.TEAMWORK_READ_ONLY,
    allowedProjectIds,
  };
}
