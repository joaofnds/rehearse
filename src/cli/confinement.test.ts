import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { Immutable } from "#benchmark/contracts";
import { requireCase } from "#cli/case-command";
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
	confinesItself,
	enterConfinement,
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
	readonly image: ProcessImage;
	readonly env: Readonly<Record<string, string>>;
}

function stubSandbox(available: boolean): Sandbox {
	return {
		confine: (argv): Promise<Confined> => {
			if (!available) {
				return Promise.resolve({
					kind: "refused",
					reason: "no sandbox on this host",
				});
			}

			return Promise.resolve({
				kind: "confined",
				image: {
					path: "/usr/bin/fake-sandbox",
					args: ["fake-sandbox", ...argv],
				},
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
		this.replacements.push({ image, env });
	}
}

describe(sessionCanRunCommands.name, () => {
	const fixtures: string[] = [];

	afterEach(async () => {
		await Promise.all(
			fixtures
				.splice(0)
				.map((fixture) => rm(fixture, { force: true, recursive: true })),
		);
	});

	async function emptyFixture(): Promise<string> {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-confinement-"));
		fixtures.push(fixture);

		return fixture;
	}

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
		const fixture = await emptyFixture();
		await mkdir(join(fixture, ".claude"));

		const withProjectSettings = sessionCase({ fixturePath: fixture });

		expect(await sessionCanRunCommands(withProjectSettings)).toBe(true);
	});

	it("does not hold for a case whose fixture brings no project settings", async () => {
		const withoutProjectSettings = sessionCase({
			fixturePath: await emptyFixture(),
		});

		expect(await sessionCanRunCommands(withoutProjectSettings)).toBe(false);
	});
});

describe(confinesItself.name, () => {
	const unloadable = (): Promise<never> =>
		Promise.reject(new Error("no case for this command"));

	it.each([
		{ confinement: "always", confined: true },
		{ confinement: "never", confined: false },
	] as const)(
		"decides a command declared $confinement without reading a case",
		async ({ confinement, confined }) => {
			expect(await confinesItself(confinement, unloadable)).toBe(confined);
		},
	);

	describe("when the command follows its case", () => {
		it("confines a pipeline case", async () => {
			expect(
				await confinesItself("by case", () => requireCase("audit-log")),
			).toBe(true);
		});

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
				image: {
					path: "/usr/bin/fake-sandbox",
					args: ["fake-sandbox", ...host.argv],
				},
				env: { HOME: "/home/op", [CONFINED_VARIABLE]: "1" },
			},
		]);
	});

	describe("when the host cannot provide the sandbox", () => {
		it("refuses with the sandbox's reason without replacing the process", async () => {
			const host = new FakeConfinementHost({}, false);

			const refusal = await failureOf(enterConfinement(host));

			expect(refusal).toBeInstanceOf(RefusedPreconditionError);
			expect(refusal.message).toBe("no sandbox on this host");
			expect(host.replacements).toEqual([]);
		});
	});
});

describe(confineIfNeeded.name, () => {
	const unloadable = (): Promise<never> =>
		Promise.reject(new Error("no case for this command"));

	it("confines a command whose sessions can run commands", async () => {
		const host = new FakeConfinementHost({}, true);

		await confineIfNeeded("always", unloadable, host);

		expect(host.replacements).toHaveLength(1);
	});

	it("leaves a command whose sessions cannot run commands as it is", async () => {
		const host = new FakeConfinementHost({}, true);

		await confineIfNeeded("never", unloadable, host);

		expect(host.replacements).toEqual([]);
	});

	it("leaves a process the sandbox already holds as it is", async () => {
		const host = new FakeConfinementHost({ [CONFINED_VARIABLE]: "1" }, true);

		await confineIfNeeded("always", unloadable, host);

		expect(host.replacements).toEqual([]);
	});

	it("refuses a command whose sessions can run commands on a host without a sandbox", async () => {
		const host = new FakeConfinementHost({}, false);

		const refusal = await failureOf(
			confineIfNeeded("always", unloadable, host),
		);

		expect(refusal).toBeInstanceOf(RefusedPreconditionError);
	});
});
