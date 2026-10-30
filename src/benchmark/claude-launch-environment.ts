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

export { withoutLaunchContext as default };
export type { Environment };
