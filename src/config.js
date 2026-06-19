import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  TEAMWORK_REQUEST_TIMEOUT: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 30000)),
  TEAMWORK_MAX_RETRIES: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 3)),
  TEAMWORK_CONFIG_FILE: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

const configFileSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiVersion: z.string().optional(),
  token: z.string().optional(),
  authMode: z.enum(["bearer", "basic_token_x"]).optional(),
  readOnly: z.boolean().optional(),
  allowedProjectIds: z.array(z.string()).optional(),
  requestTimeout: z.number().positive().optional(),
  maxRetries: z.number().nonnegative().optional(),
  logLevel: z.string().optional(),
});

/**
 * Load configuration file from path
 * @param {string} filePath - Path to JSON config file
 * @returns {object}
 */
function loadConfigFile(filePath) {
  try {
    const content = readFileSync(resolve(filePath), "utf-8");
    const parsed = JSON.parse(content);
    const validated = configFileSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Invalid config file: ${validated.error.issues.map((i) => i.message).join("; ")}`);
    }
    return validated.data;
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") {
      throw new Error(`Config file not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Merge configurations with proper precedence:
 * environment variables > config file > defaults
 */
function mergeConfigs(envConfig, fileConfig = {}) {
  return {
    baseUrl: envConfig.TEAMWORK_BASE_URL || fileConfig.baseUrl,
    apiVersion: envConfig.TEAMWORK_API_VERSION || fileConfig.apiVersion || "v3",
    token: envConfig.TEAMWORK_API_TOKEN || fileConfig.token,
    authMode: envConfig.TEAMWORK_AUTH_MODE || fileConfig.authMode || "bearer",
    readOnly: envConfig.TEAMWORK_READ_ONLY ?? fileConfig.readOnly ?? false,
    allowedProjectIds: envConfig.TEAMWORK_ALLOWED_PROJECT_IDS
      ? envConfig.TEAMWORK_ALLOWED_PROJECT_IDS.split(",").map((x) => x.trim()).filter(Boolean)
      : fileConfig.allowedProjectIds || [],
    requestTimeout: envConfig.TEAMWORK_REQUEST_TIMEOUT ?? fileConfig.requestTimeout ?? 30000,
    maxRetries: envConfig.TEAMWORK_MAX_RETRIES ?? fileConfig.maxRetries ?? 3,
    logLevel: envConfig.LOG_LEVEL || fileConfig.logLevel || "info",
  };
}

export function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Teamwork MCP configuration: ${message}`);
  }

  const envConfig = parsed.data;

  // Load config file if specified
  let fileConfig = {};
  if (envConfig.TEAMWORK_CONFIG_FILE) {
    fileConfig = loadConfigFile(envConfig.TEAMWORK_CONFIG_FILE);
  }

  // Merge configurations
  const merged = mergeConfigs(envConfig, fileConfig);

  // Validate required fields
  if (!merged.baseUrl) {
    throw new Error("Missing required configuration: TEAMWORK_BASE_URL");
  }
  if (!merged.token) {
    throw new Error("Missing required configuration: TEAMWORK_API_TOKEN");
  }

  const baseUrl = merged.baseUrl.replace(/\/+$/, "");
  const apiBase = `${baseUrl}/projects/api/${merged.apiVersion}`;

  return {
    baseUrl,
    apiBase,
    token: merged.token,
    authMode: merged.authMode,
    readOnly: merged.readOnly,
    allowedProjectIds: merged.allowedProjectIds,
    requestTimeout: merged.requestTimeout,
    maxRetries: merged.maxRetries,
    logLevel: merged.logLevel,
  };
}
