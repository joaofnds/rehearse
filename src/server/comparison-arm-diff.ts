import { dirname, join } from "node:path";

import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import serialMap from "#benchmark/serial-map";

import { comparisonAttribution, layoutPath } from "./comparison-attribution";
import { redactAbsolutePaths } from "./redact-path";
import {
	SessionHistoryReaderError,
	readRecordedEvidenceFile,
} from "./session-history-reader";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;
type ReportCase = AnyComparisonReport["cases"][number];
type ReportArm = ReportCase["arms"][ComparisonArm];

/** A file's text at one arm's version, or why the arm shows none. */
type ArmFileText =
	| { readonly state: "available"; readonly text: string }
	| { readonly state: "absent" }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

interface ArmFileDiff {
	readonly path: string;
	readonly baseline: ArmFileText;
	readonly candidate: ArmFileText;
}

const MISMATCHED_FROZEN_COPY_REASON =
	"its frozen copy no longer matches the digest the comparison recorded, or is not UTF-8 text";

function sha256(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

function groupPaths(source: ReportArm["source"]): readonly string[] {
	return "group" in source
		? [source.group.path]
		: source.groups.map(({ path }) => path);
}

async function frozenText(
	runsDirectory: string,
	groupPath: string,
	file: { readonly path: string; readonly sha256: string },
): Promise<ArmFileText> {
	try {
		const { text } = await readRecordedEvidenceFile(
			runsDirectory,
			join(dirname(groupPath), file.path),
		);

		return sha256(text) === file.sha256
			? { state: "available", text }
			: { reasons: [MISMATCHED_FROZEN_COPY_REASON], state: "unavailable" };
	} catch (error) {
		if (!(error instanceof SessionHistoryReaderError)) {
			throw error;
		}

		return {
			reasons: [
				`its frozen copy cannot be read: ${redactAbsolutePaths(error.message)}`,
			],
			state: "unavailable",
		};
	}
}
interface ArmFileRequest {
	readonly arm: ReportArm;
	readonly path: string;
	readonly mode: AnyComparisonReport["mode"];
}

/** The text an arm ran at a corpus-layout path, from the copy its group froze. */
async function armFileText(
	runsDirectory: string,
	{ arm, path, mode }: ArmFileRequest,
): Promise<ArmFileText> {
	const file = arm.executedCorpus.find(
		(executed) => layoutPath(executed.path, mode) === path,
	);
	if (file === undefined) {
		return { state: "absent" };
	}

	let text: ArmFileText = {
		reasons: ["the arm records no group"],
		state: "unavailable",
	};
	for await (const frozen of serialMap(
		groupPaths(arm.source).values(),
		async (groupPath) => await frozenText(runsDirectory, groupPath, file),
	)) {
		text = frozen;
		if (text.state === "available") {
			return text;
		}
	}

	return text;
}

/**
 * Each case's files that differ between arms A and B, with the text each arm
 * ran, so the operator reads the edit the attribution claim rests on.
 */
async function comparisonArmDiff(
	report: AnyComparisonReport,
	runsDirectory: string,
): Promise<Readonly<Record<string, readonly ArmFileDiff[]>>> {
	const entries = await Promise.all(
		report.cases.map(async ({ caseId, arms }) => {
			const attribution = comparisonAttribution(
				arms.baseline.executedCorpus,
				arms.candidate.executedCorpus,
				report.mode,
			);
			const paths =
				attribution.claim === "identical" ? [] : attribution.differingPaths;
			const files = await Promise.all(
				paths.map(async (path) => ({
					baseline: await armFileText(runsDirectory, {
						arm: arms.baseline,
						mode: report.mode,
						path,
					}),
					candidate: await armFileText(runsDirectory, {
						arm: arms.candidate,
						mode: report.mode,
						path,
					}),
					path,
				})),
			);

			return [caseId, files] as const;
		}),
	);

	return Object.fromEntries(entries);
}

export { MISMATCHED_FROZEN_COPY_REASON, comparisonArmDiff };
export type { ArmFileText, ArmFileDiff };
