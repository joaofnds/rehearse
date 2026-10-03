import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { Immutable } from "#benchmark/contracts";
import { failureOf } from "#cli/cli-test-support";
import type { ConfinementHost } from "#cli/confinement";
import {
	CONFINED_VARIABLE,
	CONFINEMENT_PROFILE,
	confinesItself,
	enterConfinement,
	SANDBOX_EXEC,
	sessionCanRunCommands,
} from "#cli/confinement";

function sessionCase(
	overrides: Immutable<Partial<SessionCase>> = {},
): SessionCase {
	return {
		kind: "session",
		declaration: {
			id: "probe",
			kind: "session",
			title: "Probe",
			prompt: "Reply with the single word OK.",
			tools: [],
			corpusFiles: [],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "Reply with the single word OK.",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: [],
		projectFiles: [],
		checks: [{ kind: "word-band", max: 1 }],
		...overrides,
	};
}

interface ProcessReplacement {
	readonly path: string;
	readonly args: readonly string[];
	readonly env: Readonly<Record<string, string>>;
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

	public constructor(
		public readonly env: Readonly<Record<string, string | undefined>>,
		private readonly hasSandboxExec: boolean,
	) {}

	public sandboxExecExists(): Promise<boolean> {
		return Promise.resolve(this.hasSandboxExec);
	}

	public replaceProcess(
		path: string,
		args: readonly string[],
		env: Readonly<Record<string, string>>,
	): void {
		this.replacements.push({ path, args, env });
	}
}

describe(sessionCanRunCommands.name, () => {
	it("holds for a case that declares a tool", async () => {
		const withRead = sessionCase({ tools: ["Read"] });

		expect(await sessionCanRunCommands(withRead)).toBe(true);
	});

	it("holds for a case whose settings declare hooks", async () => {
		const hooked = sessionCase({ settings: { hooks: {} } });

		expect(await sessionCanRunCommands(hooked)).toBe(true);
	});

	it("does not hold for a case with no tool and no hooks", async () => {
		const toolless = sessionCase({ settings: { outputStyle: "brief" } });

		expect(await sessionCanRunCommands(toolless)).toBe(false);
	});

	it("holds for a case whose fixture carries project settings", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-confinement-"));
		try {
			await mkdir(join(fixture, ".claude"));

			const withProjectSettings = sessionCase({ fixturePath: fixture });

			expect(await sessionCanRunCommands(withProjectSettings)).toBe(true);
		} finally {
			await rm(fixture, { force: true, recursive: true });
		}
	});
});

describe(confinesItself.name, () => {
	const unloadable = (): Promise<never> =>
		Promise.reject(new Error("no case for this command"));

	it.each([
		{ confinement: "always", confined: true },
		{ confinement: "never", confined: false },
	] as const)(
		"confines a command declared $confinement without reading a case",
		async ({ confinement, confined }) => {
			expect(await confinesItself(confinement, unloadable)).toBe(confined);
		},
	);

	describe("when the command follows its case", () => {
		it("confines a session case that can run commands", async () => {
			const withBash = sessionCase({ tools: ["Bash"] });

			expect(
				await confinesItself("by case", () => Promise.resolve(withBash)),
			).toBe(true);
		});

		it("leaves a session case that cannot run commands unconfined", async () => {
			const toolless = sessionCase();

			expect(
				await confinesItself("by case", () => Promise.resolve(toolless)),
			).toBe(false);
		});
	});
});

describe(enterConfinement.name, () => {
	it("replaces the process with itself under the sandbox, marked as confined", async () => {
		const host = new FakeConfinementHost({ HOME: "/home/op" }, true);

		await enterConfinement(host);

		expect(host.replacements).toEqual([
			{
				path: SANDBOX_EXEC,
				args: ["sandbox-exec", "-p", CONFINEMENT_PROFILE, ...host.argv],
				env: { HOME: "/home/op", [CONFINED_VARIABLE]: "1" },
			},
		]);
	});

	it("leaves a process the sandbox already holds as it is", async () => {
		const host = new FakeConfinementHost({ [CONFINED_VARIABLE]: "1" }, true);

		await enterConfinement(host);

		expect(host.replacements).toEqual([]);
	});

	describe("when the host has no sandbox-exec", () => {
		it("refuses by naming the missing mechanism, without replacing the process", async () => {
			const host = new FakeConfinementHost({}, false);

			const refusal = await failureOf(enterConfinement(host));

			expect(refusal).toBeInstanceOf(RefusedPreconditionError);
			expect(refusal.message).toContain(SANDBOX_EXEC);
			expect(host.replacements).toEqual([]);
		});
	});
});
