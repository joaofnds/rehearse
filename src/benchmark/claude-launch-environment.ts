import { createHash } from "node:crypto";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The CLAUDE* names a Claude Code child still needs, because they carry its
 * login, its provider or its network route rather than the parent session.
 * Taken from the names the 2.1.314 binary reads.
 */
const LOGIN_PROVIDER_AND_NETWORK_NAMES: ReadonlySet<string> = new Set([
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
	"CLAUDE_CODE_USE_ANTHROPIC_AWS",
	"CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
	"CLAUDE_CODE_USE_BEDROCK",
	"CLAUDE_CODE_USE_FOUNDRY",
	"CLAUDE_CODE_USE_GATEWAY",
	"CLAUDE_CODE_USE_MANTLE",
	"CLAUDE_CODE_USE_VERTEX",
]);

function isLoginProviderOrNetwork(name: string): boolean {
	return (
		LOGIN_PROVIDER_AND_NETWORK_NAMES.has(name) ||
		name.startsWith("CLAUDE_CODE_OAUTH_") ||
		(name.startsWith("CLAUDE_CODE_SKIP_") && name.endsWith("_AUTH")) ||
		(name.startsWith("CLAUDE_CODE_") && name.includes("PROXY"))
	);
}

function isLaunchContext(name: string): boolean {
	if (name.startsWith("CLAUDE")) {
		return !isLoginProviderOrNetwork(name);
	}

	return (
		name === "MAX_THINKING_TOKENS" ||
		(name.startsWith("ANTHROPIC_") && name.includes("MODEL"))
	);
}

/**
 * The environment without what the session that started Rehearse exported for
 * its own children: its entrypoint, ids, socket, feature flags, model and
 * effort. A Claude Code child keeping them measures differently by where
 * Rehearse was launched from.
 */
function withoutLaunchContext(env: Environment): Environment {
	return Object.fromEntries(
		Object.entries(env).filter(([name]) => !isLaunchContext(name)),
	);
}

const CLAUDE_CODE_PREFIXES = [
	"ANTHROPIC_",
	"CLAUDE",
	"DISABLE_",
	"ENABLE_",
	"MCP_",
	"OTEL_",
	"VERTEX_REGION_",
];

/**
 * Names outside the prefixes that the 2.1.314 binary reads, taken from its
 * list of names a settings file may set and its proxy names.
 */
const CLAUDE_CODE_READ_NAMES: ReadonlySet<string> = new Set([
	"ALL_PROXY",
	"API_TIMEOUT_MS",
	"AWS_DEFAULT_REGION",
	"AWS_PROFILE",
	"AWS_REGION",
	"BASH_DEFAULT_TIMEOUT_MS",
	"BASH_MAX_TIMEOUT_MS",
	"FALLBACK_FOR_ALL_PRIMARY_MODELS",
	"FORCE_PROMPT_CACHING_5M",
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"MAX_MCP_OUTPUT_TOKENS",
	"MAX_STRUCTURED_OUTPUT_RETRIES",
	"NO_PROXY",
	"SLASH_COMMAND_TOOL_CHAR_BUDGET",
	"USE_BUILTIN_RIPGREP",
]);

/**
 * Parts of a name whose value can be a credential, or hold one as a URL's
 * user info, so the record keeps the name alone: the browser serves records
 * without authentication, and a short secret's digest can be guessed.
 */
const SECRET_NAME_PARTS = [
	"AUTH",
	"CERT",
	"COOKIE",
	"CREDENTIAL",
	"HEADER",
	"KEY",
	"PASSPHRASE",
	"PASSWORD",
	"PROXY",
	"SECRET",
	"TOKEN",
];

interface InheritedVariable {
	readonly name: string;
	readonly sha256?: string;
}

function isReadByClaudeCode(name: string): boolean {
	return (
		CLAUDE_CODE_READ_NAMES.has(name) ||
		name.includes("_MAX_OUTPUT_") ||
		CLAUDE_CODE_PREFIXES.some((prefix) => name.startsWith(prefix))
	);
}

function isSecretBearing(name: string): boolean {
	return SECRET_NAME_PARTS.some((part) => name.includes(part));
}

function recordedVariable(name: string, value: string): InheritedVariable {
	if (isSecretBearing(name)) {
		return { name };
	}

	return { name, sha256: createHash("sha256").update(value).digest("hex") };
}

/**
 * The Claude Code configuration a child started from `env` still inherits
 * after the launch context rule, by name, with a digest of each value that
 * carries no secret, so two runs given different values tell apart.
 */
function inheritedConfiguration(env: Environment): InheritedVariable[] {
	const inherited = withoutLaunchContext(env);

	return Object.keys(inherited)
		.filter((name) => isReadByClaudeCode(name))
		.toSorted()
		.flatMap((name) => {
			const value = inherited[name];

			return value === undefined ? [] : [recordedVariable(name, value)];
		});
}

export { withoutLaunchContext as default, inheritedConfiguration };
export type { Environment, InheritedVariable };
