import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runShow } from "#cli/show-command";

const workspace = CliTestWorkspace.forEachTest();

async function refusesNoArgumentByNamingEveryIdForm(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const failure = await failureOf(
		runShow(
			{
				id: undefined,
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("checkpoint:<run>/<stage>");
	expect(failure.message).toContain("<case>/r<n>/s<k>");
}

async function refusesAnUnknownPrefixAsAUsageError(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const failure = await failureOf(
		runShow(
			{ id: "nonsense", json: false, runsDirectory: fixture.runsDirectory },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
}

async function namesTheFormAKnownPrefixTakesWhenIts(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const failure = await failureOf(
		runShow(
			{
				id: "checkpoint:only-one-part",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("checkpoint:<run>/<stage>");
}

async function refusesThePreconditionAndPrintsNothingOnStdout(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				id: "run:absent",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recorder.output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("run:absent");
	expect(recorder.stdout).toEqual([]);
}

function whenTheIdIsMissingOrMalformedCases(): void {
	it(
		"refuses no argument by naming every id form",
		refusesNoArgumentByNamingEveryIdForm,
	);
	it(
		"refuses an unknown prefix as a usage error",
		refusesAnUnknownPrefixAsAUsageError,
	);
	it(
		"names the form a known prefix takes when its body is wrong",
		namesTheFormAKnownPrefixTakesWhenIts,
	);
}

function whenAWellformedIdNamesNoRecordCases(): void {
	it(
		"refuses the precondition and prints nothing on stdout",
		refusesThePreconditionAndPrintsNothingOnStdout,
	);
}

function runShowCases(): void {
	describe(
		"when the id is missing or malformed",
		whenTheIdIsMissingOrMalformedCases,
	);
	describe(
		"when a well-formed id names no record",
		whenAWellformedIdNamesNoRecordCases,
	);
}

describe(runShow.name, runShowCases);
