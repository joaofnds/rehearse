import { join } from "node:path";
import type { LoadedCase, SessionCase } from "#benchmark/case";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { pathExists } from "#benchmark/file-presence";
import type { Confinement } from "#cli/commands";

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/**
 * Denies every signal except to a process inside the same sandbox, so a
 * session can stop what its run started, in any turn, and nothing else.
 */
export const CONFINEMENT_PROFILE =
	"(version 1)(allow default)(deny signal)(allow signal (target same-sandbox))";

export const CONFINED_VARIABLE = "REHEARSE_CONFINED";

/**
 * Which Claude Code tools run commands could not be established, and hooks
 * run commands whatever the tools are, so any tool, any declared hook, or
 * project settings the fixture brings in count.
 */
export function sessionCanRunCommands(
	sessionCase: SessionCase,
): Promise<boolean> {
	const { fixturePath, settings, tools } = sessionCase;
	if (tools.length > 0 || settings?.["hooks"] !== undefined) {
		return Promise.resolve(true);
	}
	if (fixturePath === undefined) {
		return Promise.resolve(false);
	}

	return pathExists(join(fixturePath, ".claude"));
}

export async function confinesItself(
	confinement: Confinement,
	loadRunCase: () => Promise<LoadedCase>,
): Promise<boolean> {
	switch (confinement) {
		case "always": {
			return true;
		}
		case "never": {
			return false;
		}
		case "by case": {
			const loaded = await loadRunCase();

			return (
				loaded.kind === "pipeline" || (await sessionCanRunCommands(loaded))
			);
		}
		default: {
			return unhandled(confinement, "confinement");
		}
	}
}

export interface ConfinementHost {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly argv: readonly string[];
	readonly sandboxExecExists: () => Promise<boolean>;
	readonly replaceProcess: (
		path: string,
		args: readonly string[],
		env: Readonly<Record<string, string>>,
	) => void;
}

function isConfined(
	env: Readonly<Record<string, string | undefined>>,
): boolean {
	return env[CONFINED_VARIABLE] === "1";
}

/**
 * Replacing the process keeps its pid, so the server's launch record, the run
 * marker, Stop, Ctrl-C and SIGHUP all reach the confined run with no wrapper
 * process to forward them.
 */
export async function enterConfinement(host: ConfinementHost): Promise<void> {
	if (!(await host.sandboxExecExists())) {
		throw new RefusedPreconditionError(
			`This command confines its sessions with ${SANDBOX_EXEC}, which this host lacks, so it runs only on macOS`,
		);
	}

	const env = Object.fromEntries(
		Object.entries(host.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

	host.replaceProcess(
		SANDBOX_EXEC,
		["sandbox-exec", "-p", CONFINEMENT_PROFILE, ...host.argv],
		{ ...env, [CONFINED_VARIABLE]: "1" },
	);
}

/**
 * Confines the process when its command's sessions can run commands and the
 * sandbox does not already hold it.
 */
export async function confineIfNeeded(
	confinement: Confinement,
	loadRunCase: () => Promise<LoadedCase>,
	host: ConfinementHost,
): Promise<void> {
	if (
		isConfined(host.env) ||
		!(await confinesItself(confinement, loadRunCase))
	) {
		return;
	}

	await enterConfinement(host);
}

export function liveConfinementHost(): ConfinementHost {
	return {
		env: Bun.env,
		argv: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
		sandboxExecExists: () => pathExists(SANDBOX_EXEC),
		replaceProcess: (path, args, env) => {
			if (process.execve === undefined) {
				throw new RefusedPreconditionError(
					"This command confines its sessions by replacing its own process, which this Bun cannot do",
				);
			}
			process.execve(path, args, env);
		},
	};
}
