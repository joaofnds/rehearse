import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { measureCorpusVersion } from "./corpus-version";
import { runSessionConfirmation } from "./session-confirmation";
import confirmationEvidence from "./session-confirmation-evidence-test-fixtures";
import { sessionConfirmationClock } from "./session-confirmation-provider-test-fixtures";
import {
	FIRST_REP_ORDINAL,
	confirmationRequest,
	declaredCorpusCase,
	metrics,
	recordedAttempt,
	simpleSessionCase,
	unavailableTranscriptDiagnostics,
} from "./session-confirmation-test-fixtures";
import {
	instructionCorpus,
	resources,
	temporaryRoot,
} from "./session-confirmation-workspace-test-fixtures";
import { attemptStartedAt } from "./session-record";

resources.registerCleanup();

async function recordsOnTheGroupAndEveryRepTheCorpusVersionMeasuredBeforeTheRepsRanAndTheSpendCeilingTheyRanUnder(): Promise<void> {
	const expectedSpendCeilingUsd = 12;

	const { root, corpusRoot } = await instructionCorpus(
		"rehearse-session-version-",
		{ "CLAUDE.md": "original instructions\n" },
	);
	const expected = await measureCorpusVersion(join(root, "elsewhere"), {
		kind: "directory",
		root: corpusRoot,
	});
	const sessionCase = declaredCorpusCase("version-group", ["CLAUDE.md"]);

	const outcome = await runSessionConfirmation(
		{
			executeAttempt: async (plan) => {
				await Bun.write(join(corpusRoot, "CLAUDE.md"), "mutated\n");
				return await recordedAttempt(plan);
			},
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "version-group",
			runsDirectory: join(root, "runs"),
			sessionCase,
			spendCeilingUsd: 12,
		}),
	);
	const { group, attempts } = await confirmationEvidence(outcome);

	expect(group.inputs.corpusVersion).toEqual(expected);
	expect(attempts.map(({ corpusVersion }) => corpusVersion)).toEqual([
		expected,
		expected,
	]);
	expect(group.inputs.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
	expect(attempts.map(({ spendCeilingUsd }) => spendCeilingUsd)).toEqual([
		expectedSpendCeilingUsd,
		expectedSpendCeilingUsd,
	]);
}

async function recordsOnTheGroupAndEveryRepSAttemptTheInstantEachStarted(): Promise<void> {
	const { root, corpusRoot } = await instructionCorpus(
		"rehearse-session-start-",
		{ "CLAUDE.md": "instructions\n" },
	);
	const clock = sessionConfirmationClock();

	const outcome = await runSessionConfirmation(
		{ executeAttempt: clock.execute, wallClock: clock.read },
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "start-group",
			runsDirectory: join(root, "runs"),
			sessionCase: simpleSessionCase("start-group"),
			spendCeilingUsd: 12,
		}),
	);
	const { group, attempts } = await confirmationEvidence(outcome);

	expect(group.startedAt).toBe("2026-10-08T10:15:00.000Z");
	expect(new Set(attempts.map((attempt) => attemptStartedAt(attempt)))).toEqual(
		new Set(["2026-10-08T10:16:00.000Z", "2026-10-08T10:27:00.000Z"]),
	);
}

async function waitsForPeersButAbortsGroupPersistenceAfterAnUntypedRepFailure(): Promise<void> {
	const expectedFirstStartedRepOrdinal = 1;
	const expectedLastStartedRepOrdinal = 2;

	const root = await temporaryRoot("rehearse-session-abort-");
	const corpusRoot = join(root, "corpus");
	await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
	const started: number[] = [];

	const failure = runSessionConfirmation(
		{
			executeAttempt: async (plan) => {
				started.push(plan.ordinal);
				return await Promise.reject(
					new Error(`unexpected rep ${plan.ordinal}`),
				);
			},
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "aborted-group",
			preflight: { missing: "metrics", status: "MISSING" },
			runsDirectory: join(root, "runs"),
			sessionCase: simpleSessionCase("abort"),
		}),
	);

	expect(failure).rejects.toThrow("unexpected rep 1");
	expect(started.toSorted((left, right) => left - right)).toEqual([
		expectedFirstStartedRepOrdinal,
		expectedLastStartedRepOrdinal,
	]);
	expect(
		await Bun.file(
			join(root, "runs", "confirmations", "aborted-group", "group.json"),
		).exists(),
	).toBe(false);
}

async function doesNotFinalizeAGroupWhenARepRecordCannotBePersisted(): Promise<void> {
	const root = await temporaryRoot("rehearse-session-persist-");
	const corpusRoot = join(root, "corpus");
	await mkdir(join(corpusRoot, "output-styles"), { recursive: true });

	const failure = runSessionConfirmation(
		{
			executeAttempt: async (plan) => {
				if (plan.ordinal === FIRST_REP_ORDINAL) {
					await Bun.write(plan.recordDirectory, "directory collision\n");
				}

				return {
					attemptDirectory: join(plan.recordDirectory, "execution"),
					checks: [{ detail: "named pass", kind: "word-band", status: "PASS" }],
					contextManifest: undefined,
					metrics,
					outcome: "SUCCESSFUL",
					reply: "OK",
					setup: { kind: "isolated" },
					transcriptDiagnostics: unavailableTranscriptDiagnostics,
					transcriptFile: join(plan.recordDirectory, "transcript.jsonl"),
				};
			},
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "persistence-group",
			preflight: { missing: "metrics", status: "MISSING" },
			runsDirectory: join(root, "runs"),
			sessionCase: simpleSessionCase("persist"),
		}),
	);

	expect(failure).rejects.toBeInstanceOf(Error);
	expect(
		await Bun.file(
			join(root, "runs", "confirmations", "persistence-group", "group.json"),
		).exists(),
	).toBe(false);
}

describe(runSessionConfirmation.name, () => {
	it(
		"records on the group and every rep the corpus version measured before the reps ran and the spend ceiling they ran under",
		recordsOnTheGroupAndEveryRepTheCorpusVersionMeasuredBeforeTheRepsRanAndTheSpendCeilingTheyRanUnder,
	);
	it(
		"records on the group and every rep's attempt the instant each started",
		recordsOnTheGroupAndEveryRepSAttemptTheInstantEachStarted,
	);
	it(
		"waits for peers but aborts group persistence after an untyped rep failure",
		waitsForPeersButAbortsGroupPersistenceAfterAnUntypedRepFailure,
	);
	it(
		"does not finalize a group when a rep record cannot be persisted",
		doesNotFinalizeAGroupWhenARepRecordCannotBePersisted,
	);
});
