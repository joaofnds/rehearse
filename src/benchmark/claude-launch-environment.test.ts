import { describe, expect, it } from "bun:test";

import withoutLaunchContext, {
	inheritedConfiguration,
} from "./claude-launch-environment";

const LAUNCH_CONTEXT_NAMES = [
	"CLAUDECODE",
	"CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS",
	"CLAUDE_CODE_DISABLE_ADVISOR_TOOL",
	"CLAUDE_CODE_EFFORT_LEVEL",
	"CLAUDE_CODE_ENTRYPOINT",
	"CLAUDE_CODE_MESSAGING_SOCKET",
	"CLAUDE_CODE_MESSAGING_TOKEN",
	"CLAUDE_CODE_PLUGIN_DIRS",
	"CLAUDE_CODE_SESSION_ID",
	"CLAUDE_CODE_USE_NATIVE_FILE_SEARCH",
	"CLAUDE_EFFORT",
	"CLAUDE_PID",
	"MAX_THINKING_TOKENS",
	"ANTHROPIC_MODEL",
	"ANTHROPIC_DEFAULT_OPUS_MODEL",
	"ANTHROPIC_SMALL_FAST_MODEL",
];

const LOGIN_AND_NETWORK_NAMES = [
	"CLAUDE_API_KEY",
	"CLAUDE_CONFIG_DIR",
	"CLAUDE_CODE_API_BASE_URL",
	"CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
	"CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
	"CLAUDE_CODE_CERT_STORE",
	"CLAUDE_CODE_CLIENT_CERT",
	"CLAUDE_CODE_CLIENT_KEY",
	"CLAUDE_CODE_CLIENT_KEY_PASSPHRASE",
	"CLAUDE_CODE_CUSTOM_OAUTH_URL",
	"CLAUDE_CODE_GATEWAY_TOKEN",
	"CLAUDE_CODE_GATEWAY_TOKEN_FILE_DESCRIPTOR",
	"CLAUDE_CODE_HTTPS_PROXY",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CLAUDE_CODE_SKIP_BEDROCK_AUTH",
	"CLAUDE_CODE_USE_BEDROCK",
	"CLAUDE_CODE_USE_VERTEX",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_BASE_URL",
	"DISABLE_PROMPT_CACHING",
	"HOME",
];

const SECRET_BEARING_NAMES = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_CUSTOM_HEADERS",
	"CLAUDE_CODE_CLIENT_CERT",
	"CLAUDE_CODE_CLIENT_KEY_PASSPHRASE",
	"CLAUDE_CODE_HTTPS_PROXY",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"HTTPS_PROXY",
	"OTEL_EXPORTER_OTLP_HEADERS",
];

const READ_OUTSIDE_THE_PREFIXES = [
	"API_TIMEOUT_MS",
	"AWS_REGION",
	"BASH_MAX_OUTPUT_LENGTH",
	"ENABLE_TOOL_SEARCH",
	"MAX_MCP_OUTPUT_TOKENS",
	"OTEL_METRICS_EXPORTER",
	"SLASH_COMMAND_TOOL_CHAR_BUDGET",
	"TASK_MAX_OUTPUT_LENGTH",
	"USE_BUILTIN_RIPGREP",
	"VERTEX_REGION_CLAUDE_5_5_SONNET",
];

describe(withoutLaunchContext.name, () => {
	it.each(LAUNCH_CONTEXT_NAMES)("drops %s", (name) => {
		expect(withoutLaunchContext({ [name]: "1" })).toEqual({});
	});

	it.each(LOGIN_AND_NETWORK_NAMES)("keeps %s", (name) => {
		expect(withoutLaunchContext({ [name]: "1" })).toEqual({ [name]: "1" });
	});
});

describe(inheritedConfiguration.name, () => {
	it("names each Claude Code variable with a digest of its value", () => {
		expect(
			inheritedConfiguration({ DISABLE_PROMPT_CACHING: "1", HOME: "/h" }),
		).toEqual([
			{
				name: "DISABLE_PROMPT_CACHING",
				sha256:
					"6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
			},
		]);
	});

	it.each(SECRET_BEARING_NAMES)("names %s without its value", (name) => {
		expect(inheritedConfiguration({ [name]: "s3cret" })).toEqual([{ name }]);
	});

	it.each(READ_OUTSIDE_THE_PREFIXES)("names %s", (name) => {
		expect(inheritedConfiguration({ [name]: "1" })).toMatchObject([{ name }]);
	});

	it("lists the names in order", () => {
		const unordered = Object.fromEntries([
			["MCP_TIMEOUT", "1"],
			["ANTHROPIC_BETAS", "b"],
		]);

		expect(inheritedConfiguration(unordered).map(({ name }) => name)).toEqual([
			"ANTHROPIC_BETAS",
			"MCP_TIMEOUT",
		]);
	});

	it("leaves out a name the launch context rule drops", () => {
		expect(inheritedConfiguration({ CLAUDE_CODE_ENTRYPOINT: "cli" })).toEqual(
			[],
		);
	});
});
