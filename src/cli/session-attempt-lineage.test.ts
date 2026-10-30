import { describe, expect, it } from "bun:test";

import ABSENT_HOME from "#benchmark/session-setup-test-fixtures";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import SessionCorpusFixture from "./session-corpus-test-fixture";
import { fakeClaude } from "./session-provider-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

async function changesTheLineageWhenTheSourceSDeclaredBytesDiffer(): Promise<void> {
	const first = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("one brief\n")),
	);
	const second = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("another brief\n")),
	);

	expect(second.record.lineage).not.toBe(first.record.lineage);
}

async function leavesTheLineageUnchangedWhenTwoSourcesResolveToIdenticalBytes(): Promise<void> {
	const first = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("same brief\n")),
	);
	const second = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("same brief\n")),
	);

	expect(second.record.lineage).toBe(first.record.lineage);
}

/**
 * Every smoke attempt recorded before --corpus existed carries this lineage.
 * A change to it would mean the flag silently rewrote what a run absent the
 * flag measures, which is the one thing this card promised it would not do.
 * ACT-37 added a fifth, settings-file field to lineageKey's hashed shape; a
 * session case never sets it, so the pin moved once, deliberately, to the
 * hash of the same four fields plus an always-absent fifth.
 */
async function recordsTheLineageTheSmokeCaseCarriedBeforeCorpusExisted(): Promise<void> {
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		home: ABSENT_HOME,
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK"),
		runsDirectory: await files.temporary("rehearse-runs-"),
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});

	expect(outcome.record.lineage).toBe(
		"f5c101c10b2941f88f89b2ba059a7f2ca6782162ef7ddccded391fd2c4d5b71b",
	);
}

describe("running a session case against a corpus source", () => {
	it(
		"changes the lineage when the source's declared bytes differ",
		changesTheLineageWhenTheSourceSDeclaredBytesDiffer,
	);
	it(
		"leaves the lineage unchanged when two sources resolve to identical bytes",
		leavesTheLineageUnchangedWhenTwoSourcesResolveToIdenticalBytes,
	);
	it(
		"records the lineage the smoke case carried before --corpus existed",
		recordsTheLineageTheSmokeCaseCarriedBeforeCorpusExisted,
	);
});
