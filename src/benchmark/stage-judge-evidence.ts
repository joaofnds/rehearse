import type {
	ContextFile,
	EvidenceLocator,
	StageJudgeInput,
	StageJudgeOutput,
	StageJudgeResponse,
} from "./contracts";
import { citationMatchesPath, unhandled } from "./contracts";
import type { CitedFile } from "./evidence-locator";
import {
	locateInCommitSubjects,
	locateInDiff,
	locateInExchanges,
	locateInFiles,
} from "./evidence-locator";
import { harnessLocator } from "./stage-harness-results";
import citesWholeSource from "./whole-source-citation";

function validateStageJudgeEvidence(
	output: StageJudgeOutput,
	input: StageJudgeInput,
): void {
	const availablePaths = {
		artifact: input.artifact ? [input.artifact.path] : [],
		"baseline-context": input.baselineContext.map(({ path }) => path),
		// Harness-owned sources stay citable even when the input carries no
		// result for them: a Judge failing a delivery because check results are
		// absent is citing exactly that absence.
		"check-integrity": ["harness"],
		"commit-subjects":
			input.commitSubjects === undefined ? [] : ["commitSubjects"],
		diff: input.changedPaths ?? [],
		"harness-failure": ["harness"],
		instructions: ["CLAUDE.md"],
		"local-checks": ["harness"],
		"prior-artifact": input.priorArtifacts.map(({ path }) => path),
		"product-brief": ["product-brief.md"],
		task: ["backlog-seed.md"],
		"task-state": ["backlog/task.json"],
		transcript: [`${input.stage}.transcript.json`],
	} satisfies Record<
		StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
		readonly string[]
	>;

	for (const item of [
		...output.hardBlockers,
		...output.requirements,
		...output.dimensions,
	]) {
		for (const evidence of item.evidence) {
			// A claim that spans a whole source (for example "nothing prohibited
			// appears in the diff") has no single file to cite; the source's own
			// name is its citation.
			if (
				!citesWholeSource(evidence.path, evidence.source) &&
				!citationMatchesPath(evidence.path, availablePaths[evidence.source])
			) {
				throw new Error(
					`Stage Judge cited unavailable evidence for ${item.id}: ${evidence.source}:${evidence.path}`,
				);
			}
		}
	}
}

type RecordedStageEvidence =
	StageJudgeOutput["requirements"][number]["evidence"][number];
type JudgeStageEvidence =
	StageJudgeResponse["requirements"][number]["evidence"][number];

function textFiles(files: readonly ContextFile[]): CitedFile[] {
	return files.map(({ path, content }) => ({ file: path, text: content }));
}

/**
 * The recorded text a stage evidence source names, one entry per file, under
 * the name a lines locator gives it. A source that is not text has none.
 */
function stageTextFiles(
	source: RecordedStageEvidence["source"],
	input: StageJudgeInput,
): CitedFile[] {
	switch (source) {
		case "task": {
			return [{ file: "backlog-seed.md", text: input.task }];
		}
		case "product-brief": {
			return [{ file: "product-brief.md", text: input.productBrief }];
		}
		case "instructions": {
			return [{ file: "CLAUDE.md", text: input.instructions }];
		}
		case "task-state": {
			return [{ file: "backlog/task.json", text: input.taskState }];
		}
		case "artifact": {
			return textFiles(input.artifact ? [input.artifact] : []);
		}
		case "prior-artifact": {
			return textFiles(input.priorArtifacts);
		}
		case "baseline-context": {
			return textFiles(input.baselineContext);
		}
		case "transcript":
		case "diff":
		case "commit-subjects":
		case "check-integrity":
		case "local-checks":
		case "harness-failure": {
			return [];
		}
		default: {
			return unhandled(source, "stage evidence source");
		}
	}
}

function citesFile(evidence: JudgeStageEvidence, file: string): boolean {
	return (
		citesWholeSource(evidence.path, evidence.source) ||
		citationMatchesPath(evidence.path, [file])
	);
}

/**
 * Where the quote sits in the source the judge cited, or undefined when that
 * source does not hold it. Harness sources and a source the input lacks are
 * not quoted: their locator names the harness result or the absence.
 */
function stageEvidenceLocator(
	evidence: JudgeStageEvidence,
	input: StageJudgeInput,
): EvidenceLocator | undefined {
	const { quote } = evidence;
	switch (evidence.source) {
		case "check-integrity":
		case "local-checks":
		case "harness-failure": {
			return harnessLocator(evidence.source, input);
		}
		case "commit-subjects": {
			return input.commitSubjects === undefined
				? { kind: "absent" }
				: locateInCommitSubjects(quote, input.commitSubjects);
		}
		case "task":
		case "product-brief":
		case "instructions":
		case "task-state": {
			return locateInFiles(quote, stageTextFiles(evidence.source, input));
		}
		case "transcript": {
			return locateInExchanges(quote, input.transcript.exchanges);
		}
		case "artifact":
		case "prior-artifact":
		case "baseline-context": {
			return locateInFiles(
				quote,
				stageTextFiles(evidence.source, input).filter(({ file }) =>
					citesFile(evidence, file),
				),
			);
		}
		case "diff": {
			return locateInDiff(quote, input.diff ?? "", (file) =>
				citesFile(evidence, file),
			);
		}
		default: {
			return unhandled(evidence.source, "stage evidence source");
		}
	}
}

/**
 * The judge's evidence as the record keeps it: each item with the locator the
 * harness computed, and its quote wherever the locator points into text. A
 * quote its cited source does not hold rejects the output, since a claim must
 * be traceable to a source the operator can open.
 */
/**
 * The checks every judge item faces, whether it is counted as progress while
 * the judge writes or accepted with the whole output.
 */
function checkedStageEvidence(
	response: StageJudgeResponse,
	input: StageJudgeInput,
): StageJudgeOutput {
	validateStageJudgeEvidence(response, input);

	return locateStageEvidence(response, input);
}

function locateStageEvidence(
	response: StageJudgeResponse,
	input: StageJudgeInput,
): StageJudgeOutput {
	const located = (
		id: string,
		evidence: readonly JudgeStageEvidence[],
	): RecordedStageEvidence[] =>
		evidence.map((item) => {
			const { quote, ...cited } = item;
			const locator = stageEvidenceLocator(item, input);
			if (locator === undefined) {
				throw new Error(
					`Stage Judge quoted text its cited source does not hold for ${id}: ${item.source}:${item.path}`,
				);
			}

			return locator.kind === "harness" || locator.kind === "absent"
				? { ...cited, locator }
				: { ...cited, locator, quote };
		});

	const hardBlockers = response.hardBlockers.map((result) => ({
		...result,
		evidence: located(result.id, result.evidence),
	}));
	const requirements = response.requirements.map((result) => ({
		...result,
		evidence: located(result.id, result.evidence),
	}));
	const dimensions = response.dimensions.map((result) => ({
		...result,
		evidence: located(result.id, result.evidence),
	}));

	return {
		dimensions,
		hardBlockers,
		requirements,
		summary: response.summary,
	};
}

export {
	validateStageJudgeEvidence,
	stageTextFiles,
	checkedStageEvidence,
	locateStageEvidence,
};
