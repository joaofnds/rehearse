import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf } from "#cli/cli-test-support";
import type {
	Confined,
	ConfinementHost,
	ProcessImage,
	Sandbox,
} from "#cli/confinement";
import {
	CONFINED_VARIABLE,
	confineIfNeeded,
	enterConfinement,
} from "#cli/confinement";

const unloadable = async (): Promise<never> =>
	await Promise.reject(new Error("no case for this command"));

interface ProcessReplacement {
	readonly image: ProcessImage;
	readonly env: Readonly<Record<string, string>>;
}

function stubSandbox(available: boolean): Sandbox {
	return {
		confine: async (argv): Promise<Confined> => {
			if (!available) {
				return await Promise.resolve<Confined>({
					kind: "refused",
					reason: "no sandbox on this host",
				});
			}

			return await Promise.resolve<Confined>({
				image: {
					args: ["fake-sandbox", ...argv],
					path: "/usr/bin/fake-sandbox",
				},
				kind: "confined",
			});
		},
	};
}

class FakeConfinementHost implements ConfinementHost {
	public readonly replacements: ProcessReplacement[] = [];
	public readonly argv = [
		"/opt/bun",
		"/repo/rehearse.ts",
		"run",
		"--case",
		"smoke",
	];

	public readonly sandbox: Sandbox;

	public constructor(
		public readonly env: Readonly<Record<string, string | undefined>>,
		hasSandbox: boolean,
	) {
		this.sandbox = stubSandbox(hasSandbox);
	}

	public replaceProcess(
		image: ProcessImage,
		env: Readonly<Record<string, string>>,
	): void {
		this.replacements.push({ env, image });
	}
}

async function replacesTheProcessWithItselfUnderTheSandboxMarked(): Promise<void> {
	const host = new FakeConfinementHost({ HOME: "/home/op" }, true);

	await enterConfinement(host);

	expect(host.replacements).toEqual([
		{
			env: { HOME: "/home/op", [CONFINED_VARIABLE]: "1" },
			image: {
				args: ["fake-sandbox", ...host.argv],
				path: "/usr/bin/fake-sandbox",
			},
		},
	]);
}

async function refusesWithTheSandboxSReasonWithoutReplacingThe(): Promise<void> {
	const host = new FakeConfinementHost({}, false);

	const refusal = await failureOf(enterConfinement(host));

	expect(refusal).toBeInstanceOf(RefusedPreconditionError);
	expect(refusal.message).toBe("no sandbox on this host");
	expect(host.replacements).toEqual([]);
}

async function confinesACommandWhoseSessionsCanRunCommands(): Promise<void> {
	const expectedReplacementCount = 1;

	const host = new FakeConfinementHost({}, true);

	await confineIfNeeded("always", unloadable, host);

	expect(host.replacements).toHaveLength(expectedReplacementCount);
}

async function leavesACommandWhoseSessionsCannotRunCommandsAs(): Promise<void> {
	const host = new FakeConfinementHost({}, true);

	await confineIfNeeded("never", unloadable, host);

	expect(host.replacements).toEqual([]);
}

async function leavesAProcessTheSandboxAlreadyHoldsAsIt(): Promise<void> {
	const host = new FakeConfinementHost({ [CONFINED_VARIABLE]: "1" }, true);

	await confineIfNeeded("always", unloadable, host);

	expect(host.replacements).toEqual([]);
}

async function refusesACommandWhoseSessionsCanRunCommandsOn(): Promise<void> {
	const host = new FakeConfinementHost({}, false);

	const refusal = await failureOf(confineIfNeeded("always", unloadable, host));

	expect(refusal).toBeInstanceOf(RefusedPreconditionError);
}

describe(enterConfinement.name, () => {
	it(
		"replaces the process with itself under the sandbox, marked as confined",
		replacesTheProcessWithItselfUnderTheSandboxMarked,
	);
});

describe(`${enterConfinement.name} > when the host cannot provide the sandbox`, () => {
	it(
		"refuses with the sandbox's reason without replacing the process",
		refusesWithTheSandboxSReasonWithoutReplacingThe,
	);
});

describe(confineIfNeeded.name, () => {
	it(
		"confines a command whose sessions can run commands",
		confinesACommandWhoseSessionsCanRunCommands,
	);
	it(
		"leaves a command whose sessions cannot run commands as it is",
		leavesACommandWhoseSessionsCannotRunCommandsAs,
	);
	it(
		"leaves a process the sandbox already holds as it is",
		leavesAProcessTheSandboxAlreadyHoldsAsIt,
	);
	it(
		"refuses a command whose sessions can run commands on a host without a sandbox",
		refusesACommandWhoseSessionsCanRunCommandsOn,
	);
});
