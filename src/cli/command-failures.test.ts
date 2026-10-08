import { describe, expect, it } from "bun:test";
import { UsageError } from "#cli/commands";
import { CommandError } from "#benchmark/command";
import { EXIT_CODES, exitCodeFor } from "#benchmark/exit-codes";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

describe("command failures", () => {
	it("gives each exit code one meaning", () => {
		expect(EXIT_CODES).toEqual({
			completed: 0,
			executionFailure: 1,
			usageError: 2,
			refusedPrecondition: 3,
		});
	});

	it("carries the usage exit code on the usage error itself", () => {
		const error = new UsageError("Unknown flag --bogus");

		expect(error.exitCode).toBe(EXIT_CODES.usageError);
		expect(error.name).toBe("UsageError");
		expect(error.message).toBe("Unknown flag --bogus");
	});

	it("carries the refusal exit code on the refused precondition itself", () => {
		const error = new RefusedPreconditionError("The review pause needs a TTY");

		expect(error.exitCode).toBe(EXIT_CODES.refusedPrecondition);
		expect(error.name).toBe("RefusedPreconditionError");
	});

	it.each([
		{
			kind: "a usage error",
			error: new UsageError("Unknown flag --bogus"),
			code: EXIT_CODES.usageError,
		},
		{
			kind: "a refused precondition",
			error: new RefusedPreconditionError("stdin is not a terminal"),
			code: EXIT_CODES.refusedPrecondition,
		},
		{
			kind: "any other failure",
			error: new Error("the target is dirty"),
			code: EXIT_CODES.executionFailure,
		},
		{
			kind: "a failed external command",
			error: new CommandError(["git", "rev-parse", "HEAD"], 128, "", "fatal"),
			code: EXIT_CODES.executionFailure,
		},
	])("maps $kind to exit code $code", ({ error, code }) => {
		expect(exitCodeFor(error)).toBe(code);
	});
});
