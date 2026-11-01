import { readStructuredOutput } from "./claude";
import { judgeGradeResponseSchema } from "./contracts";
import type {
	ClaudeEnvelope,
	JudgeGrade,
	JudgeGradeResponse,
} from "./contracts";
import { locateInFiles } from "./evidence-locator";
import { parseRubricIds } from "./judge";
import validateJudgeGrade from "./judge-grade";
import type { SessionJudgeInput } from "./session-judge-contract";

const CITATION_PATH_COMPONENT_INDEX = 0;
const CITATION_PATH_COMPONENT_COUNT = 1;

interface SessionJudgeResponseRequest {
	readonly envelope: ClaudeEnvelope;
	readonly rubric: string;
	readonly input: SessionJudgeInput;
}

function locatedRequirement(
	requirement: JudgeGradeResponse["requirements"][number],
	input: SessionJudgeInput,
): JudgeGrade["requirements"][number] {
	return {
		...requirement,
		evidence: requirement.evidence.map((item) => {
			const path = item.path.split("#", CITATION_PATH_COMPONENT_COUNT)[
				CITATION_PATH_COMPONENT_INDEX
			];
			const files = input.files.filter(
				(file) =>
					path === "baseline-context" ||
					file.path === item.path ||
					file.path === path,
			);
			if (item.source !== "baseline-context") {
				throw new Error(
					`Session Judge cited unavailable source ${item.source}`,
				);
			}

			const locator = locateInFiles(
				item.quote,
				files.map((file) => ({ file: file.path, text: file.content })),
			);
			if (locator === undefined) {
				throw new Error(`Session Judge quote is not held by ${item.path}`);
			}

			return { ...item, locator };
		}),
	};
}

function readSessionJudgeGrade({
	envelope,
	rubric,
	input,
}: SessionJudgeResponseRequest): JudgeGrade {
	const response = validateJudgeGrade(
		readStructuredOutput(envelope, judgeGradeResponseSchema),
		parseRubricIds(rubric),
	);

	return {
		...response,
		requirements: response.requirements.map((requirement) =>
			locatedRequirement(requirement, input),
		),
	};
}

export { readSessionJudgeGrade as default };
