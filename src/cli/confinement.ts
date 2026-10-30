import { join } from "node:path";

import type { LoadedCase, SessionCase } from "#benchmark/case";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { pathExists } from "#benchmark/file-presence";
import type { Confinement } from "#cli/commands";
import sandboxFor from "#cli/sandbox";

const ENVIRONMENT_VALUE_ENTRY_INDEX = 1;
const RUNTIME_EXECUTABLE_ARGUMENT_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

const CONFINED_VARIABLE = "REHEARSE_CONFINED";

/**
 * Which Claude Code tools run commands could not be established, and hooks
 * run commands whatever the tools are, so any tool, any declared hook, or
 * project settings the fixture brings in count. A case that does not declare
 * isolation runs with the user's own hooks, plugins and permission mode,
 * which can run commands whatever the case lists.
 */
async function sessionCanRunCommands(
	sessionCase: SessionCase,
): Promise<boolean> {
	const { fixturePath, isolated, settings, tools } = sessionCase;
	if (
		!isolated ||
		tools.length > EMPTY_COLLECTION_LENGTH ||
		settings?.["hooks"] !== undefined
	) {
		return true;
	}
	if (fixturePath === undefined) {
		return false;
	}

	return await pathExists(join(fixturePath, ".claude"));
}

async function confinesItself(
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

interface ProcessImage {
	readonly path: string;
	readonly args: readonly string[];
}

type Confined =
	| { readonly kind: "confined"; readonly image: ProcessImage }
	| { readonly kind: "refused"; readonly reason: string };

/**
 * One operating system's way to hold a process, and every process it starts,
 * so that none of them can signal a process outside it.
 */
interface Sandbox {
	readonly confine: (argv: readonly string[]) => Promise<Confined>;
}

interface ConfinementHost {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly argv: readonly string[];
	readonly sandbox: Sandbox;
	readonly replaceProcess: (
		image: ProcessImage,
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
async function enterConfinement(host: ConfinementHost): Promise<void> {
	const confined = await host.sandbox.confine(host.argv);
	if (confined.kind === "refused") {
		throw new RefusedPreconditionError(confined.reason);
	}

	const env = Object.fromEntries(
		Object.entries(host.env).filter(
			(entry): entry is [string, string] =>
				entry[ENVIRONMENT_VALUE_ENTRY_INDEX] !== undefined,
		),
	);

	host.replaceProcess(confined.image, {
		...env,
		[CONFINED_VARIABLE]: "1",
	});
}

/**
 * Confines the process when its command's sessions can run commands and the
 * sandbox does not already hold it.
 */
async function confineIfNeeded(
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

function liveConfinementHost(): ConfinementHost {
	return {
		argv: [
			process.execPath,
			...process.execArgv,
			...process.argv.slice(RUNTIME_EXECUTABLE_ARGUMENT_COUNT),
		],
		env: Bun.env,
		replaceProcess: (image, env) => {
			if (process.execve === undefined) {
				throw new RefusedPreconditionError(
					"This command confines its sessions by replacing its own process, which this Bun cannot do",
				);
			}
			process.execve(image.path, image.args, env);
		},
		sandbox: sandboxFor(process.platform, pathExists),
	};
}

export {
	CONFINED_VARIABLE,
	confineIfNeeded,
	confinesItself,
	enterConfinement,
	liveConfinementHost,
	sessionCanRunCommands,
};
export type { Confined, ConfinementHost, ProcessImage, Sandbox };
