import type {
	ContextFile,
	EvidenceLocator,
	JudgeGrade,
	JudgeGradeResponse,
} from "./contracts";
import { citationMatchesPath, unhandled } from "./contracts";
import { locateInDiff, locateInFiles } from "./evidence-locator";
import { HARNESS_LOCATORS, isHarnessRequirement } from "./judge-harness";
import citesWholeSource from "./whole-source-citation";

function validateJudgeEvidence(
	grade: JudgeGrade,
	changedPaths: readonly string[],
	contextPaths: readonly string[],
): void {
	for (const requirement of grade.requirements) {
		if (!["check-integrity", "local-checks"].includes(requirement.id)) {
			for (const evidence of requirement.evidence) {
				// A claim that spans a whole source has no single file to cite; the
				// source's own name, in any spelling, is its citation.
				const valid =
					citesWholeSource(evidence.path, evidence.source) ||
					(evidence.source === "diff" &&
						citationMatchesPath(evidence.path, changedPaths)) ||
					(evidence.source === "baseline-context" &&
						citationMatchesPath(evidence.path, contextPaths));

				if (!valid) {
					throw new Error(
						`Judge cited unavailable evidence for ${requirement.id}: ${evidence.source}:${evidence.path}`,
					);
				}
			}
		}
	}
}

type JudgeEvidence =
	JudgeGradeResponse["requirements"][number]["evidence"][number];

function judgeEvidenceLocator(
	evidence: JudgeEvidence,
	diff: string,
	baselineContext: readonly ContextFile[],
): EvidenceLocator | undefined {
	const cites = (file: string): boolean =>
		citesWholeSource(evidence.path, evidence.source) ||
		citationMatchesPath(evidence.path, [file]);
	switch (evidence.source) {
		case "local-checks": {
			return HARNESS_LOCATORS["local-checks"];
		}
		case "diff": {
			return locateInDiff(evidence.quote, diff, cites);
		}
		case "baseline-context": {
			return locateInFiles(
				evidence.quote,
				baselineContext
					.filter(({ path }) => cites(path))
					.map(({ path, content }) => ({ file: path, text: content })),
			);
		}
		default: {
			return unhandled(evidence.source, "judge evidence source");
		}
	}
}

/**
 * The final judge's evidence as the record keeps it, located the way the
 * stage judge's is. The harness requirements lose their quotes unlocated,
 * since the harness replaces their evidence with its own results.
 */
function locateJudgeEvidence(
	response: JudgeGradeResponse,
	diff: string,
	baselineContext: readonly ContextFile[],
): JudgeGrade {
	return {
		...response,
		requirements: response.requirements.map((requirement) => ({
			...requirement,
			evidence: requirement.evidence.map((item) => {
				const { quote, ...cited } = item;
				if (isHarnessRequirement(requirement.id)) {
					return cited;
				}

				const locator = judgeEvidenceLocator(item, diff, baselineContext);
				if (locator === undefined) {
					throw new Error(
						`Judge quoted text its cited source does not hold for ${requirement.id}: ${item.source}:${item.path}`,
					);
				}

				return locator.kind === "harness"
					? { ...cited, locator }
					: { ...cited, locator, quote };
			}),
		})),
	};
}

export { validateJudgeEvidence, locateJudgeEvidence };
