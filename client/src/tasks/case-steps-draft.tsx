import type { StageDefinition } from "#benchmark/pipeline";

import type { DeclaredSteps } from "./case-steps-api";

const DEFAULT_RUBRIC_INDEX = 0;

const STEP_MOVE_NEXT = 1;

const STEP_MOVE_PREVIOUS = -1;

type StepMove = typeof STEP_MOVE_NEXT | typeof STEP_MOVE_PREVIOUS;

const MOVED_STEP_COUNT = 1;

const NO_REPLACED_STEPS = 0;

type StepKind = "planning" | "delivery";

/** One step as the form holds it, every field a string the operator types. */
interface StepDraft {
	readonly name: string;
	readonly kind: StepKind;
	readonly skill: string;
	readonly rubric: string;
	readonly artifact: string;
	readonly requiresAcceptanceCriteria: boolean;
}

function draftOf(stage: DeclaredSteps["stages"][number]): StepDraft {
	return stage.kind === "planning"
		? {
				artifact: stage.artifact ?? "",
				kind: stage.kind,
				name: stage.name,
				requiresAcceptanceCriteria: stage.requiresAcceptanceCriteria,
				rubric: stage.rubric,
				skill: stage.skill,
			}
		: {
				artifact: "",
				kind: stage.kind,
				name: stage.name,
				requiresAcceptanceCriteria: false,
				rubric: stage.rubric,
				skill: stage.skill,
			};
}

/** A blank artifact is left out, since the harness reads its absence as none. */
function savedStage(draft: StepDraft): StageDefinition {
	const name = draft.name.trim();
	const skill = draft.skill.trim();
	if (draft.kind === "delivery") {
		return { kind: draft.kind, name, rubric: draft.rubric, skill };
	}

	const planning = {
		kind: draft.kind,
		name,
		requiresAcceptanceCriteria: draft.requiresAcceptanceCriteria,
		rubric: draft.rubric,
		skill,
	};
	const artifact = draft.artifact.trim();

	return artifact === "" ? planning : { ...planning, artifact };
}

/** The skills the corpus holds, each a `skills/<name>/SKILL.md` file. */
function corpusSkills(paths: readonly string[]): readonly string[] {
	return paths.flatMap((path) => {
		const skill = /^skills\/(?<skill>[^/]+)\/SKILL\.md$/u.exec(path)?.groups?.[
			"skill"
		];

		return skill === undefined ? [] : [skill];
	});
}

function moved<T>(items: readonly T[], from: number, by: StepMove): T[] {
	const next = [...items];
	const to = from + by;
	const [item] = next.splice(from, MOVED_STEP_COUNT);
	if (item === undefined) {
		return next;
	}
	next.splice(to, NO_REPLACED_STEPS, item);

	return next;
}

export {
	corpusSkills,
	DEFAULT_RUBRIC_INDEX,
	draftOf,
	moved,
	savedStage,
	STEP_MOVE_NEXT,
	STEP_MOVE_PREVIOUS,
};
export type { StepDraft, StepMove };
