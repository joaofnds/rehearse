import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { runCommand } from "#benchmark/command";
import { ComparisonEvidenceFixture } from "#benchmark/comparison-evidence-test-support";
import { parseComparisonManifest } from "#benchmark/comparison-record";
import { recordsDirectory } from "#benchmark/config";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
	comparisonReportPaths,
	recordedRunNames,
} from "#benchmark/run-layout";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

const FIRST_CASE_FIXTURE_ROOT_INDEX = 0;

const PIPE_BUFFER_BYTES = 131_072;

/**
 * One fixture writes two cases, whose report is smaller than the 131072-byte
 * pipe buffer. Composing several fixture roots into one manifest crosses that
 * buffer, which is what a truncated write is observable against.
 */
async function writeOversizedManifest(
	roots: readonly string[],
): Promise<string> {
	const caseGroups = await Array.fromAsync(roots, async (root) => {
		const fixture = new ComparisonEvidenceFixture(root, [
			`case-1-${basename(root)}`,
			`case-2-${basename(root)}`,
		]);
		await fixture.write();
		const manifest = parseComparisonManifest(
			await Bun.file(fixture.manifestFile).text(),
		);
		const rooted = (groups: readonly string[]): readonly string[] =>
			groups.map((group) => join(root, group));
		return manifest.cases.map((benchmarkCase) => ({
			arms: {
				baseline: rooted(benchmarkCase.arms.baseline),
				candidate: rooted(benchmarkCase.arms.candidate),
				control: rooted(benchmarkCase.arms.control),
			},
			caseId: benchmarkCase.caseId,
		}));
	});
	const cases = caseGroups.flat();
	const manifestFile = join(
		roots[FIRST_CASE_FIXTURE_ROOT_INDEX] ?? "",
		"oversized-comparison.json",
	);
	await Bun.write(
		manifestFile,
		`${JSON.stringify(
			{ cases, schemaVersion: 1 },
			null,
			RECORD_JSON_INDENT_SPACES,
		)}\n`,
	);

	return manifestFile;
}

/**
 * The directories a failed replay keeps on purpose, named on its own stderr.
 * This test drives a replay to failure, so without collecting them every run
 * leaves a worktree behind in the system temp directory.
 */
function preservedEvidenceIn(stderr: string): readonly string[] {
	return [...stderr.matchAll(/evidence preserved at (?<directory>\S+)/gu)].map(
		(match) => dirname(match.groups?.["directory"] ?? ""),
	);
}

/** The only recorded run under this control directory, and the checkout it worked in. */
async function recordedCheckout(
	control: string,
): Promise<{ readonly run: string; readonly checkout: string }> {
	const runsDirectory = benchmarkRunsDirectory(control);
	const [run] = await recordedRunNames(runsDirectory);
	if (run === undefined) {
		throw new Error(`No run was recorded in ${runsDirectory}`);
	}

	const { sourceRoot } = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);

	return { checkout: sourceRoot, run };
}

async function headSha(repository: string): Promise<string> {
	const sha = await runCommand(["git", "rev-parse", "HEAD"], repository);

	return sha.trim();
}

/**
 * The confirmation report, found through the group record the command names on
 * its own stderr. Reading it from stdout instead would assume the very thing
 * this test is here to check.
 */
function reportBesideGroupIn(stderr: string): string {
	const group = /Confirmation group: (?<file>\S+)/u.exec(stderr)?.groups?.[
		"file"
	];
	if (group === undefined) {
		throw new Error(`no confirmation group on stderr:\n${stderr}`);
	}

	return join(dirname(group), "report.json");
}

interface ComparisonCliFixture {
	readonly temporaryDirectory: string;
	readonly runsDirectory: string;
	readonly fixture: ComparisonEvidenceFixture;
}
function comparisonCliFixture(): ComparisonCliFixture {
	const temporaryDirectory = join(
		tmpdir(),
		`rehearse-compare-cli-${randomUUID()}`,
	);
	return {
		fixture: new ComparisonEvidenceFixture(temporaryDirectory),
		runsDirectory: join(temporaryDirectory, "runs"),
		temporaryDirectory,
	};
}
interface ComparisonRecordFiles {
	readonly directory: string;
	readonly reportFile: string;
}
async function reportForComparisonManifest(
	manifestFile: string,
): Promise<ComparisonRecordFiles> {
	const sha = createHash("sha256")
		.update(await Bun.file(manifestFile).text())
		.digest("hex");
	return comparisonReportPaths(recordsDirectory(), sha);
}

export {
	comparisonCliFixture,
	headSha,
	PIPE_BUFFER_BYTES,
	preservedEvidenceIn,
	recordedCheckout,
	reportBesideGroupIn,
	reportForComparisonManifest,
	writeOversizedManifest,
};
