import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { COMMANDS } from "#cli/commands";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import {
	CLI_TEST_TIMEOUT_MS,
	UNREPORTED_EXIT_CODE,
	environmentWithoutKnobs,
	runCli,
} from "./cli-process-test-driver";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const BARE_REFUSALS: ReadonlyMap<string, { code: number; reason: string }> =
	new Map([
		[
			"run",
			{
				code: EXIT_CODES.refusedPrecondition,
				reason: "nothing you passed authorizes the spend",
			},
		],
		["replay", { code: EXIT_CODES.usageError, reason: "Provide --run" }],
		["review", { code: EXIT_CODES.usageError, reason: "Provide the run" }],
		["diagnose", { code: EXIT_CODES.usageError, reason: "Provide the run" }],
		["calibrate", { code: EXIT_CODES.usageError, reason: "Provide the run" }],
		[
			"compare",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide the comparison manifest",
			},
		],
		[
			"compare attempts",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide both attempts' confirmation groups",
			},
		],
		[
			"compare extend",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide the comparison to extend by its manifest digest",
			},
		],
		["list", { code: EXIT_CODES.usageError, reason: "is not one of" }],
		["show", { code: EXIT_CODES.usageError, reason: "Provide the record id" }],
		[
			"regrade",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide the attempt to regrade",
			},
		],
		["stale", { code: EXIT_CODES.completed, reason: "" }],
		["corpus versions", { code: EXIT_CODES.completed, reason: "" }],
		["corpus invalidation", { code: EXIT_CODES.completed, reason: "" }],
		[
			"corpus show",
			{ code: EXIT_CODES.usageError, reason: "Provide the corpus version" },
		],
		["settings", { code: EXIT_CODES.completed, reason: "" }],
		["case list", { code: EXIT_CODES.completed, reason: "" }],
		[
			"case show",
			{ code: EXIT_CODES.usageError, reason: "Provide the case id" },
		],
		[
			"case capture",
			{ code: EXIT_CODES.usageError, reason: "Provide the case id" },
		],
	]);

async function refusesAComparisonNothingSavedBeforeAnyProviderCall(): Promise<void> {
	const records = await mkdtemp(join(tmpdir(), "rehearse-cli-extend-"));
	try {
		const result = await runCli(
			[
				"compare",
				"extend",
				"--comparison",
				`comparison:${"0".repeat(SHA256_HEX_DIGITS)}`,
				"--attempts",
				"2",
				"--yes",
			],
			"empty",
			{
				...environmentWithoutKnobs(),
				[RECORDS_DIRECTORY_VARIABLE]: records,
			},
		);

		expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
		expect(result.stderr).toContain(
			`No saved comparison ${"0".repeat(SHA256_HEX_DIGITS)}`,
		);
		expect(result.stdout).toBe("");
	} finally {
		await rm(records, { force: true, recursive: true });
	}
}

describe("every declared command", () => {
	it.each(COMMANDS.map((command) => command.name))(
		"refuses rehearse %s with no argument, exactly as declared",
		async (name) => {
			const expected = BARE_REFUSALS.get(name);

			const result = await runCli(name.split(" "));

			expect(expected).toBeDefined();
			expect(result.stderr).not.toContain("declared but not wired up");
			expect(result.exitCode).toBe(expected?.code ?? UNREPORTED_EXIT_CODE);
			expect(result.stderr).toContain(expected?.reason ?? "");
		},
	);
});

const refusesNameBeforeAnyProviderCallExamples = [
	{
		args: ["--pause", "--target", "/nonexistent-target"],
		name: "run",
		reason: "stdin is not a terminal",
	},
	{
		args: ["--run", "absent", "--stage", "build"],
		name: "replay",
		reason: "No replayable run named absent",
	},
];

describe("a paying command given every session knob", () => {
	it.each(refusesNameBeforeAnyProviderCallExamples)(
		"refuses $name before any provider call",
		async ({ name, args, reason }) => {
			const result = await runCli([
				name,
				...args,
				"--model",
				"sonnet",
				"--session-budget-usd",
				"1",
			]);

			expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
			expect(result.stderr).toContain(reason);
			expect(result.stdout).toBe("");
		},
	);
});

describe("compare extend", () => {
	it(
		"refuses a comparison nothing saved before any provider call",
		refusesAComparisonNothingSavedBeforeAnyProviderCall,
	);
});
