import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { TOML } from "bun";

import { assertPinnedBunVersion, pinnedBunRefusal } from "./bun-pin";
import { PROJECT_ROOT } from "./test-support";

const OVERSIZED_VERSION_CHARACTERS = 100_000;

describe("pinnedBunRefusal", () => {
	it("returns no refusal when the running version matches the required one", () => {
		expect(
			pinnedBunRefusal({ required: "1.2.3", running: "1.2.3" }),
		).toBeNull();
	});

	it("names the required and the running version when they differ", () => {
		expect(pinnedBunRefusal({ required: "9.9.9", running: "1.2.3" })).toBe(
			"Use Bun 9.9.9; current version is 1.2.3",
		);
	});
});

describe("assertPinnedBunVersion", () => {
	it("throws the refusal when the running version is not the required one", () => {
		expect(() => {
			assertPinnedBunVersion("9.9.9");
		}).toThrow(`Use Bun 9.9.9; current version is ${Bun.version}`);
	});
});

describe("bun-pin-guard", () => {
	it.each([
		{ label: "version mismatch", required: "9.9.9" },
		{
			label: "long version mismatch",
			required: "9".repeat(OVERSIZED_VERSION_CHARACTERS),
		},
	])(
		"writes the whole $label to stderr before exiting",
		async ({ required }) => {
			const expectedExitCode = 1;

			const child = Bun.spawn(
				[join(PROJECT_ROOT, "src/benchmark/bun-pin-guard.ts"), required],
				{
					env: {
						...Bun.env,
						PATH: `${dirname(process.execPath)}:${Bun.env["PATH"] ?? ""}`,
					},
					stderr: "pipe",
					stdout: "pipe",
				},
			);
			const [exitCode, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);

			expect(exitCode).toBe(expectedExitCode);
			expect(stdout).toBe("");
			expect(stderr).toBe(
				`Use Bun ${required}; current version is ${Bun.version}\n`,
			);
		},
	);
});

describe("bunfig.toml", () => {
	it("lists the version guard and the records-directory preload in bunfig", async () => {
		const bunfig = TOML.parse(
			await Bun.file(join(PROJECT_ROOT, "bunfig.toml")).text(),
		);

		expect(bunfig).toMatchObject({
			test: {
				preload: [
					"./src/benchmark/bun-pin-guard.ts",
					"./src/benchmark/test-records-directory.ts",
				],
			},
		});
	});
});
