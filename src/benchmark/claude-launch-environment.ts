import { createHash } from "node:crypto";

import type { InheritedVariable } from "./session-record-context-schema";

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
	"CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS",
	"CLAUDE_CODE_CERT_STORE",
	"CLAUDE_CODE_CLIENT_CERT",
	"CLAUDE_CODE_CLIENT_KEY",
	"CLAUDE_CODE_CLIENT_KEY_PASSPHRASE",
	"CLAUDE_CODE_CUSTOM_OAUTH_URL",
	"CLAUDE_CODE_GATEWAY_TOKEN",
	"CLAUDE_CODE_GATEWAY_TOKEN_FILE_DESCRIPTOR",
	"CLAUDE_CODE_SKIP_AWS_CRED_CACHE",
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

const PREFIXES_CLAUDE_CODE_READS = [
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
 * list of names a settings file may set, its provider names, its proxy names
 * in both cases and its extra certificate authority file.
 */
const NAMES_CLAUDE_CODE_READS: ReadonlySet<string> = new Set([
	"ALL_PROXY",
	"API_TIMEOUT_MS",
	"AWS_ACCESS_KEY_ID",
	"AWS_BEARER_TOKEN_BEDROCK",
	"AWS_DEFAULT_REGION",
	"AWS_PROFILE",
	"AWS_REGION",
	"AWS_ROLE_ARN",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
	"AWS_WEB_IDENTITY_TOKEN_FILE",
	"BASH_DEFAULT_TIMEOUT_MS",
	"BASH_MAX_TIMEOUT_MS",
	"CLOUDSDK_AUTH_ACCESS_TOKEN",
	"CLOUD_ML_REGION",
	"FALLBACK_FOR_ALL_PRIMARY_MODELS",
	"FORCE_PROMPT_CACHING_5M",
	"GCLOUD_PROJECT",
	"GOOGLE_APPLICATION_CREDENTIALS",
	"GOOGLE_CLOUD_PROJECT",
	"GOOGLE_CLOUD_QUOTA_PROJECT",
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"MAX_MCP_OUTPUT_TOKENS",
	"MAX_STRUCTURED_OUTPUT_RETRIES",
	"NODE_EXTRA_CA_CERTS",
	"NO_PROXY",
	"SLASH_COMMAND_TOOL_CHAR_BUDGET",
	"USE_BUILTIN_RIPGREP",
	"all_proxy",
	"http_proxy",
	"https_proxy",
	"no_proxy",
]);

/**
 * Words of a name whose value can be a credential, so the record keeps the
 * name alone: the browser serves records without authentication, and a short
 * secret's digest can be guessed. A proxy URL can carry user info, and the
 * proxy bypass list cannot.
 */
const SECRET_NAME_WORDS: ReadonlySet<string> = new Set([
	"ATTRIBUTES",
	"AUTH",
	"CERT",
	"COOKIE",
	"CREDENTIALS",
	"CREDS",
	"HEADERS",
	"KEY",
	"PASSPHRASE",
	"PASSWORD",
	"PAT",
	"PROXY",
	"SECRET",
	"TOKEN",
]);

const PROXY_BYPASS_LIST = "NO_PROXY";

function isReadByClaudeCode(name: string): boolean {
	return (
		NAMES_CLAUDE_CODE_READS.has(name) ||
		name.includes("_MAX_OUTPUT_") ||
		PREFIXES_CLAUDE_CODE_READS.some((prefix) => name.startsWith(prefix))
	);
}

function isSecretBearing(name: string): boolean {
	const upperCaseName = name.toUpperCase();

	return (
		upperCaseName !== PROXY_BYPASS_LIST &&
		upperCaseName.split("_").some((word) => SECRET_NAME_WORDS.has(word))
	);
}

/** A URL's user info, query and fragment can carry a credential. */
function withoutCredentials(value: string): string {
	if (!URL.canParse(value)) {
		return value;
	}

	const url = new URL(value);

	return `${url.protocol}//${url.host}${url.pathname}`;
}

/**
 * Whether a variable a Claude Code child receives changes how it runs, as
 * launch context Rehearse drops or as configuration it records.
 */
function isClaudeCodeConfiguration(name: string): boolean {
	return isLaunchContext(name) || isReadByClaudeCode(name);
}

function recordedVariable(name: string, value: string): InheritedVariable {
	if (isSecretBearing(name)) {
		return { name };
	}

	return {
		name,
		sha256: createHash("sha256")
			.update(withoutCredentials(value))
			.digest("hex"),
	};
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

export {
	withoutLaunchContext as default,
	inheritedConfiguration,
	isClaudeCodeConfiguration,
};
export type { Environment };
