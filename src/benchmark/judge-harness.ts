import { HARNESS_RUBRIC_IDS } from "./config";
import type {
	EvidenceLocator,
	JudgeGrade,
	LocalCheckResult,
} from "./contracts";

type HarnessRequirement = (typeof HARNESS_RUBRIC_IDS)[number];

/** The final judge's input always holds both harness results. */
const HARNESS_LOCATORS = {
	"check-integrity": {
		kind: "harness",
		recorded: true,
		result: "checkIntegrity",
	},
	"local-checks": { kind: "harness", recorded: true, result: "localChecks" },
} as const satisfies Record<HarnessRequirement, EvidenceLocator>;

function isHarnessRequirement(id: string): id is HarnessRequirement {
	return HARNESS_RUBRIC_IDS.some((harnessId) => harnessId === id);
}

function harnessRequirement(
	id: HarnessRequirement,
	result: LocalCheckResult,
): JudgeGrade["requirements"][number] {
	return {
		evidence: result.evidence.map((item) => ({
			...item,
			locator: HARNESS_LOCATORS[id],
		})),
		id,
		status: result.status,
	};
}

function applyHarnessResults(
	grade: JudgeGrade,
	checkIntegrity: LocalCheckResult,
	localChecks: LocalCheckResult,
): JudgeGrade {
	const requirements = grade.requirements.map((requirement) => {
		if (requirement.id === "local-checks") {
			return harnessRequirement(requirement.id, localChecks);
		}

		if (requirement.id === "check-integrity") {
			return harnessRequirement(requirement.id, checkIntegrity);
		}

		return requirement;
	});

	return {
		requirements,
		summary:
			localChecks.status === "PASS" && checkIntegrity.status === "PASS"
				? grade.summary
				: `Harness checks failed. ${grade.summary}`,
		verdict: requirements.every(({ status }) => status === "PASS")
			? "PASS"
			: "FAIL",
	};
}

export { HARNESS_LOCATORS, isHarnessRequirement, applyHarnessResults };
