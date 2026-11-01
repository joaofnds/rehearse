import { join } from "node:path";
import { parseArgs } from "node:util";

import { RefusedPreconditionError } from "./exit-codes";
import { pathExists } from "./file-presence";
import { jsonObjectSchema } from "./json-value";

const CONFINED_VARIABLE = "REHEARSE_CONFINED";
const EXECUTABLE_ARGUMENT_COUNT = 1;

const SESSION_OPTIONS = {
	agents: { type: "string" },
	"dangerously-skip-permissions": { type: "boolean" },
	"disable-slash-commands": { type: "boolean" },
	effort: { type: "string" },
	"include-partial-messages": { type: "boolean" },
	"json-schema": { type: "string" },
	"max-budget-usd": { type: "string" },
	"mcp-config": { type: "string" },
	model: { type: "string" },
	"no-session-persistence": { type: "boolean" },
	"output-format": { type: "string" },
	"plugin-dir": { type: "string" },
	print: { short: "p", type: "boolean" },
	resume: { type: "string" },
	"safe-mode": { type: "boolean" },
	"session-id": { type: "string" },
	"setting-sources": { type: "string" },
	settings: { type: "string" },
	"strict-mcp-config": { type: "boolean" },
	"system-prompt": { type: "string" },
	"system-prompt-snapshot": { type: "string" },
	tools: { type: "string" },
	verbose: { type: "boolean" },
} as const;

type SessionControls = ReturnType<
	typeof parseArgs<{ options: typeof SESSION_OPTIONS }>
>["values"];

function sessionControls(command: readonly string[]): SessionControls | false {
	try {
		const { tokens, values } = parseArgs({
			allowPositionals: true,
			args: command.slice(EXECUTABLE_ARGUMENT_COUNT),
			options: SESSION_OPTIONS,
			strict: true,
			tokens: true,
		});
		const names = tokens
			.filter((token) => token.kind === "option")
			.map((token) => token.name);

		return new Set(names).size === names.length ? values : false;
	} catch {
		return false;
	}
}

function declaresHooks(settings: string | undefined): boolean {
	if (settings === undefined) {
		return false;
	}

	try {
		const parsed = jsonObjectSchema.safeParse(JSON.parse(settings));

		return !parsed.success || parsed.data["hooks"] !== undefined;
	} catch {
		return true;
	}
}

async function requiresConfinement(
	command: readonly string[],
	cwd: string,
): Promise<boolean> {
	const controls = sessionControls(command);
	if (
		controls === false ||
		controls.tools !== "" ||
		controls["strict-mcp-config"] !== true ||
		controls["dangerously-skip-permissions"] === true ||
		controls["mcp-config"] !== undefined ||
		controls["plugin-dir"] !== undefined ||
		declaresHooks(controls.settings)
	) {
		return true;
	}
	if (
		controls["safe-mode"] === true &&
		controls["disable-slash-commands"] === true
	) {
		return false;
	}
	if (controls["setting-sources"] !== "project") {
		return true;
	}

	const configuration = await Promise.all([
		pathExists(join(cwd, ".claude", "settings.json")),
		pathExists(join(cwd, ".claude", "settings.local.json")),
	]);

	return configuration.some(Boolean);
}

async function assertSessionConfinement(
	command: readonly string[],
	cwd: string,
): Promise<void> {
	if (Bun.env[CONFINED_VARIABLE] === "1") {
		return;
	}
	if (await requiresConfinement(command, cwd)) {
		throw new RefusedPreconditionError(
			"Refusing to start Claude: this invocation requires signal confinement, but Rehearse is not marked confined. Check the command's confinement declaration.",
		);
	}
}

export { CONFINED_VARIABLE, assertSessionConfinement };
