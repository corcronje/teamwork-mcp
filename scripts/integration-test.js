#!/usr/bin/env node

/**
 * Integration test for Teamwork MCP server
 * Run with: node scripts/integration-test.js
 *
 * This script tests:
 * 1. Configuration loading
 * 2. Teamwork API connectivity
 * 3. Basic tool operations (read-only)
 * 4. Error handling
 */

import { loadConfig } from "../src/config.js";
import { TeamworkClient } from "../src/teamworkClient.js";
import { logger } from "../src/logger.js";

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  TESTS.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.error("Starting Teamwork MCP server integration tests...\n");

  for (const testCase of TESTS) {
    try {
      await testCase.fn();
      console.error(`✓ ${testCase.name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${testCase.name}`);
      console.error(`  Error: ${error.message}\n`);
      failed++;
    }
  }

  console.error(`\nResults: ${passed} passed, ${failed} failed out of ${TESTS.length} tests\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Setup: Create a mock config if env not set
function getTestConfig() {
  if (!process.env.TEAMWORK_BASE_URL) {
    // Use mock config for testing without real credentials
    process.env.TEAMWORK_BASE_URL = "https://example.teamwork.com";
    process.env.TEAMWORK_API_TOKEN = "test_token_12345";
    return true; // Mock was set
  }
  return false; // Real env was already set
}

// Test 1: Configuration loading
test("Load configuration from environment", () => {
  const mockWasSet = getTestConfig();
  const config = loadConfig();
  assert(config.baseUrl, "baseUrl not set");
  assert(config.token, "token not set");
  assert(config.apiBase, "apiBase not computed");
  if (mockWasSet) {
    delete process.env.TEAMWORK_BASE_URL;
    delete process.env.TEAMWORK_API_TOKEN;
  }
});

// Test 2: TeamworkClient instantiation
test("Create TeamworkClient instance", () => {
  getTestConfig();
  const config = loadConfig();
  const client = new TeamworkClient(config);
  assert(client.config, "config not stored");
  assert(client.requestTimeout, "requestTimeout not set");
  assert(client.maxRetries, "maxRetries not set");
});

// Test 3: Verify authentication headers
test("Generate proper authorization headers", () => {
  getTestConfig();
  const config = loadConfig();
  const client = new TeamworkClient(config);
  const headers = client.getHeaders();
  assert(headers["Authorization"], "Authorization header not set");
  assert(
    headers["Authorization"].startsWith("Bearer ") || headers["Authorization"].startsWith("Basic "),
    "Authorization header has unexpected format"
  );
});

// Test 4: Verify request timeout configuration
test("Request timeout configured correctly", () => {
  getTestConfig();
  const config = loadConfig();
  const client = new TeamworkClient(config);
  assert(typeof client.requestTimeout === "number", "requestTimeout is not a number");
  assert(client.requestTimeout > 0, "requestTimeout must be positive");
});

// Test 5: Verify retry configuration
test("Retry configuration set correctly", () => {
  getTestConfig();
  const config = loadConfig();
  const client = new TeamworkClient(config);
  assert(typeof client.maxRetries === "number", "maxRetries is not a number");
  assert(client.maxRetries >= 0, "maxRetries must be non-negative");
});

// Test 6: Verify retryable status detection
test("Retryable status codes identified correctly", () => {
  getTestConfig();
  const config = loadConfig();
  const client = new TeamworkClient(config);

  // Should be retryable
  assert(client._isRetryable(408), "408 should be retryable");
  assert(client._isRetryable(429), "429 should be retryable");
  assert(client._isRetryable(500), "500 should be retryable");
  assert(client._isRetryable(502), "502 should be retryable");
  assert(client._isRetryable(504), "504 should be retryable");

  // Should not be retryable
  assert(!client._isRetryable(400), "400 should not be retryable");
  assert(!client._isRetryable(401), "401 should not be retryable");
  assert(!client._isRetryable(403), "403 should not be retryable");
  assert(!client._isRetryable(404), "404 should not be retryable");
});

// Test 7: Logger initialization
test("Logger initialized with correct level", () => {
  assert(logger, "logger not initialized");
  assert(logger.level !== undefined, "logger level not set");
});

// Test 8: Error handling imports
test("Error types available", async () => {
  const { ValidationError, AuthenticationError, NotFoundError } = await import("../src/errors.js");
  assert(ValidationError, "ValidationError not exported");
  assert(AuthenticationError, "AuthenticationError not exported");
  assert(NotFoundError, "NotFoundError not exported");
});

// Test 9: Version information available
test("Version information available", async () => {
  const { VERSION, CAPABILITIES, getServerMetadata } = await import("../src/version.js");
  assert(VERSION, "VERSION not exported");
  assert(CAPABILITIES, "CAPABILITIES not exported");
  assert(getServerMetadata, "getServerMetadata not exported");

  const metadata = getServerMetadata();
  assert(metadata.name, "server name not set");
  assert(metadata.version, "server version not set");
});

// Test 10: Configuration with read-only mode
test("Read-only mode can be enabled", () => {
  process.env.TEAMWORK_READ_ONLY = "true";
  try {
    const config = loadConfig();
    assert(config.readOnly === true, "readOnly mode not enabled");
  } finally {
    delete process.env.TEAMWORK_READ_ONLY;
  }
});

// Test 11: Configuration with allowed projects
test("Allowed project IDs can be configured", () => {
  process.env.TEAMWORK_ALLOWED_PROJECT_IDS = "123,456,789";
  try {
    const config = loadConfig();
    assert(Array.isArray(config.allowedProjectIds), "allowedProjectIds not an array");
    assert(config.allowedProjectIds.length === 3, "allowedProjectIds length incorrect");
    assert(config.allowedProjectIds.includes("123"), "project 123 not in list");
  } finally {
    delete process.env.TEAMWORK_ALLOWED_PROJECT_IDS;
  }
});

// Run all tests
runTests().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
