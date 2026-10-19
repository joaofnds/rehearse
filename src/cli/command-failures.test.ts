import { describe, expect, it } from "bun:test";

import { CommandError } from "#benchmark/command";
import {
	EXIT_CODES,
	RefusedPreconditionError,
	exitCodeFor,
} from "#benchmark/exit-codes";
import { UsageError } from "#cli/command-usage";

function givesEachExitCodeOneMeaning(): void {
	expect(EXIT_CODES).toEqual({
		completed: 0,
		executionFailure: 1,
		refusedPrecondition: 3,
		usageError: 2,
	});
}

function carriesTheUsageExitCodeOnTheUsageError(): void {
	const error = new UsageError("Unknown flag --bogus");

	expect(error.exitCode).toBe(EXIT_CODES.usageError);
	expect(error.name).toBe("UsageError");
	expect(error.message).toBe("Unknown flag --bogus");
}

function carriesTheRefusalExitCodeOnTheRefusedPrecondition(): void {
	const error = new RefusedPreconditionError("The review pause needs a TTY");

	expect(error.exitCode).toBe(EXIT_CODES.refusedPrecondition);
	expect(error.name).toBe("RefusedPreconditionError");
}

const mapsKindToExitCodeCodeExamples = [
	{
		code: EXIT_CODES.usageError,
		error: new UsageError("Unknown flag --bogus"),
		kind: "a usage error",
	},
	{
		code: EXIT_CODES.refusedPrecondition,
		error: new RefusedPreconditionError("stdin is not a terminal"),
		kind: "a refused precondition",
	},
	{
		code: EXIT_CODES.executionFailure,
		error: new Error("the target is dirty"),
		kind: "any other failure",
	},
	{
		code: EXIT_CODES.executionFailure,
		error: new CommandError(["git", "rev-parse", "HEAD"], {
			exitCode: 128,
			stderr: "fatal",
			stdout: "",
		}),
		kind: "a failed external command",
	},
];

describe("command failures", () => {
	it("gives each exit code one meaning", givesEachExitCodeOneMeaning);
	it(
		"carries the usage exit code on the usage error itself",
		carriesTheUsageExitCodeOnTheUsageError,
	);
	it(
		"carries the refusal exit code on the refused precondition itself",
		carriesTheRefusalExitCodeOnTheRefusedPrecondition,
	);
	it.each(mapsKindToExitCodeCodeExamples)(
		"maps $kind to exit code $code",
		({ error, code }) => {
			expect(exitCodeFor(error)).toBe(code);
		},
	);
});
