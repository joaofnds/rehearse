import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { AnalysisInvoker } from "./root-cause-analysis";
import { analyzeRun } from "./root-cause-analysis";
import {
	ANSWER,
	FakeAnalysisProvider,
} from "./root-cause-analysis-provider-test-fixtures";
import {
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
	snapshot,
} from "./root-cause-analysis-test-environment";
import type { AnalysisStorageExample } from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const ANALYSIS_EXAMPLES_0 = [
	{
		digest: "c9f5ed01b92948cdec94b5995afa3ea31084efff79511c7ef52676fe08a87556",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24,"structured_output":{"rootCause":{"stage":"build","file":"skills/build/SKILL.md","lines":{"start":2,"end":3}},"narrative":"the build skill never asks for a direct run","pairedRerun":"replay build with the run step restored","stages":[{"stage":"shape","role":"not a factor","note":"the card was complete","contribution":"left the grade where it was"},{"stage":"build","role":"root cause","note":"no direct run was recorded","contribution":"cost the observed-result requirement"}]}}',
		name: "recorded analysis with spend",
	},
	{
		digest: "1bc0fccbf81250fabfe3c5c3a2668e7c8882d9dce2a5bfafec0d98fd70abf4c1",
		json: '{"session_id":"analysis-session","structured_output":{"rootCause":{"stage":"build","file":"skills/build/SKILL.md","lines":{"start":2,"end":3}},"narrative":"the build skill never asks for a direct run","pairedRerun":"replay build with the run step restored","stages":[{"stage":"shape","role":"not a factor","note":"the card was complete","contribution":"left the grade where it was"},{"stage":"build","role":"root cause","note":"no direct run was recorded","contribution":"cost the observed-result requirement"}]}}',
		name: "recorded analysis without spend",
	},
	{
		digest: "3ed5228b661bacb4cfc530d57da32ead4ed935f2ce9a0046abb7b9a521970611",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24,"structured_output":{"second":{"__proto__":{"preserved":true}},"first":1}}',
		name: "failed analysis with original payload ownership and order",
	},
	{
		digest: "477fd0e3ffcd097b3c62210ff166469d3003a429af8d57f66c6ce0f0a26851fc",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24}',
		name: "failed analysis without payload",
	},
];
async function retainsStoredAnalysisBytes({
	digest,
	json,
}: AnalysisStorageExample): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const invoke: AnalysisInvoker = async () => await Promise.resolve(json);

	const { file } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(invoke),
	);
	const bytes = await Bun.file(file).text();
	const actual = createHash("sha256").update(bytes).digest("hex");

	expect(actual).toBe(digest);
}

async function keepsTheAnswerWithItsCostDurationAndStartInItsOwnFile(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);

	const { file, record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(new FakeAnalysisProvider().invoke),
	);

	expect(record).toMatchObject({
		capUsd: 1,
		costUsd: 0.24,
		durationMs: 4000,
		model: "sonnet",
		narrative: ANSWER.narrative,
		outcome: "recorded",
		pairedRerun: ANSWER.pairedRerun,
		rootCause: ANSWER.rootCause,
		run: RUN,
		schemaVersion: 2,
		startedAt: "2026-10-04T12:00:00.000Z",
	});
	expect(await Bun.file(file).json()).toEqual(record);
	expect(file).toBe(
		join(directory, "analyses", RUN, "2026-10-04T12-00-00.000Z.json"),
	);
}

async function keepsASecondAnalysisBesideTheFirstAndChangesNothingElse(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const analyses = dependencies(new FakeAnalysisProvider().invoke);

	const first = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		analyses,
	);
	const before = await snapshot(directory);

	const second = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		analyses,
	);

	const after = await snapshot(directory);
	after.delete(second.file.slice(directory.length));

	expect(second.file).not.toBe(first.file);
	expect(after).toEqual(before);
}
describe(analyzeRun.name, () => {
	it.each(ANALYSIS_EXAMPLES_0)(
		"retains historical saved bytes for $name",
		retainsStoredAnalysisBytes,
	);
	it(
		"keeps the answer with its cost, duration and start in its own file",
		keepsTheAnswerWithItsCostDurationAndStartInItsOwnFile,
	);
	it(
		"keeps a second analysis beside the first and changes nothing else",
		keepsASecondAnalysisBesideTheFirstAndChangesNothingElse,
	);
});
