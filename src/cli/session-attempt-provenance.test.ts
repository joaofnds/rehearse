import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { measureCorpusVersion } from "#benchmark/corpus-version";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { readShortIds } from "#benchmark/short-id";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import SessionCorpusFixture from "./session-corpus-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

async function recordsTheCorpusSourceSBytesRatherThanTheLiveInstallS(): Promise<void> {
	const outcome = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("marker brief\n")),
	);

	const [observedFirstCorpusFile] = outcome.record.corpusFiles;

	expect(observedFirstCorpusFile?.sha256).toBe(
		new Bun.CryptoHasher("sha256").update("marker brief\n").digest("hex"),
	);
}

/**
 * Criterion 8's purpose is that two runs at one ref are comparable and a
 * moved ref is visible, which only holds if the record on disk says where
 * the bytes came from.
 */
async function recordsTheDirectorySourceTheCorpusCameFrom(): Promise<void> {
	const root = await corpora.corpusDirectory("marker brief\n");

	const outcome = await runSessionDebugAttempt(await corpora.requestFor(root));

	expect(outcome.record.corpusOrigin).toEqual({
		kind: "directory",
		source: root,
	});
}

async function recordsTheCorpusVersionOfTheSourceItRanAgainst(): Promise<void> {
	const root = await corpora.corpusDirectory("marker brief\n");
	const expected = await measureCorpusVersion(
		await files.temporary("rehearse-records-"),
		{ kind: "directory", root },
	);

	const outcome = await runSessionDebugAttempt(await corpora.requestFor(root));

	expect(outcome.record.corpusVersion).toEqual(expected);
}

async function recordsTheLiveInstallAsTheOriginWhenNoSourceIsNamed(): Promise<void> {
	const live = await corpora.liveCorpus("owned live brief\n");
	const request = await corpora.requestFor();

	const outcome = await runSessionDebugAttempt({
		...request,
		resolveCorpus: async () => await Promise.resolve(live),
	});

	expect(outcome.record.corpusOrigin).toEqual({ kind: "live" });
}

async function writesTheOriginToTheRecordFileNotOnlyToTheValueItReturns(): Promise<void> {
	const root = await corpora.corpusDirectory("marker brief\n");

	const outcome = await runSessionDebugAttempt(await corpora.requestFor(root));

	expect(
		parseSessionAttemptRecord(await Bun.file(outcome.recordFile).text())
			.corpusOrigin,
	).toEqual({ kind: "directory", source: root });
}

/**
 * The attempt runs with `--setting-sources project`, so the session reads the
 * overlay the harness installs rather than the operator's install. The bytes
 * are still the live install's, captured once; the resolved path is the frozen
 * copy, because recording the live path would claim the session read a file it
 * did not. The origin keeps the provenance, asserted by the test above.
 */
async function recordsTheLiveInstallSBytesResolvedToTheFrozenCopyWhenNoSourceIsNamed(): Promise<void> {
	const live = await corpora.liveCorpus("owned live brief\n");
	const request = await corpora.requestFor();

	const outcome = await runSessionDebugAttempt({
		...request,
		resolveCorpus: async () => await Promise.resolve(live),
	});

	const [observedFirstCorpusFile] = outcome.record.corpusFiles;

	expect(observedFirstCorpusFile?.resolvedPath).toBe(
		join(dirname(outcome.recordFile), "corpus/output-styles/brief.md"),
	);
	const sourcePath = join(live.root, "output-styles/brief.md");
	expect(observedFirstCorpusFile?.sha256).toBe(
		new Bun.CryptoHasher("sha256")
			.update(await Bun.file(sourcePath).bytes())
			.digest("hex"),
	);
}

async function refusesACorpusChangedBetweenSnapshotAndVersionMeasurement(): Promise<void> {
	const root = await corpora.corpusDirectory("before brief\n");
	const request = await corpora.requestFor(root);
	const paidCalls: string[] = [];

	const failure = await failureOf(
		runSessionDebugAttempt({
			...request,
			measureCorpusVersion: async (records, source) => {
				await Bun.write(join(root, "output-styles/brief.md"), "after brief\n");

				return await measureCorpusVersion(records, source);
			},
			runClaude: async () => {
				paidCalls.push("provider");

				return await Promise.reject(new Error("the provider must not run"));
			},
		}),
	);

	expect(await Bun.file(join(root, "output-styles/brief.md")).text()).toBe(
		"after brief\n",
	);
	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"Corpus entry output-styles/brief.md changed while preparing the attempt; retry with an unchanged corpus source",
	);
	expect(paidCalls).toEqual([]);
	expect(await readShortIds(request.runsDirectory, "smoke")).toEqual([]);
	expect(
		await Array.fromAsync(
			new Bun.Glob("sessions/smoke/*/attempt.json").scan({
				cwd: request.runsDirectory,
			}),
		),
	).toEqual([]);
}

describe("running a session case against a corpus source", () => {
	it(
		"records the corpus source's bytes rather than the live install's",
		recordsTheCorpusSourceSBytesRatherThanTheLiveInstallS,
	);
	it(
		"records the directory source the corpus came from",
		recordsTheDirectorySourceTheCorpusCameFrom,
	);
	it(
		"records the corpus version of the source it ran against",
		recordsTheCorpusVersionOfTheSourceItRanAgainst,
	);
	it(
		"records the live install as the origin when no source is named",
		recordsTheLiveInstallAsTheOriginWhenNoSourceIsNamed,
	);
	it(
		"writes the origin to the record file, not only to the value it returns",
		writesTheOriginToTheRecordFileNotOnlyToTheValueItReturns,
	);
	it(
		"records the live install's bytes, resolved to the frozen copy, when no source is named",
		recordsTheLiveInstallSBytesResolvedToTheFrozenCopyWhenNoSourceIsNamed,
	);
	it(
		"refuses a corpus changed between its snapshot and version measurement before invoking the provider or claiming a short id",
		refusesACorpusChangedBetweenSnapshotAndVersionMeasurement,
	);
});
