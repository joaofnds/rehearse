import { z } from "zod";
import type { StageJudgeResponse, StageRubric } from "./contracts";
import { stageJudgeResponseSchema } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import type { ClosedItem } from "./judge-stream";
import { StructuredOutputStream } from "./judge-stream";
import type { JudgeProgress, JudgeSectionCount } from "./run-events";

/**
 * Runs the judge with its output streamed, handing each output line to
 * `onLine` as it arrives, and resolves to the session's result envelope.
 */
export type StageJudgeInvoker = (
	prompt: string,
	onLine: (line: string) => void,
) => Promise<string>;

const PROGRESS_SECTIONS = [
	"hardBlockers",
	"requirements",
	"dimensions",
] as const;
type ProgressSection = (typeof PROGRESS_SECTIONS)[number];
const progressSectionSchema = z.enum(PROGRESS_SECTIONS);

export interface JudgeProgressWatch {
	readonly invoke: JudgeInvoker;
	readonly rejected: (reason: string) => void;
}

/**
 * Counts the judge's items per rubric section as its streamed output closes
 * each one, reporting the counts before any grade exists. An item counts only
 * once it is a rubric id not yet returned and passes `checkItem`, which the
 * caller gives the checks the whole output will face.
 */
export function watchJudgeProgress(
	invoke: StageJudgeInvoker,
	rubric: StageRubric,
	checkItem: (partial: StageJudgeResponse) => void,
	report: (progress: JudgeProgress) => void,
): JudgeProgressWatch {
	let attempt = 0;
	let returned = new Map<ProgressSection, Set<string>>();

	const returning = (): JudgeProgress => {
		const count = (section: ProgressSection): JudgeSectionCount => ({
			returned: returned.get(section)?.size ?? 0,
			total: rubric[section].length,
		});

		return {
			state: "returning",
			attempt,
			sections: {
				hardBlockers: count("hardBlockers"),
				requirements: count("requirements"),
				dimensions: count("dimensions"),
			},
		};
	};
	const startOver = (): void => {
		returned = new Map(
			PROGRESS_SECTIONS.map((section) => [section, new Set()]),
		);
		report(returning());
	};
	const passedChecks = (
		section: ProgressSection,
		{ item }: ClosedItem,
	): string | undefined => {
		const partial = stageJudgeResponseSchema.safeParse({
			hardBlockers: [],
			requirements: [],
			dimensions: [],
			summary: "in progress",
			[section]: [item],
		});
		if (!partial.success) {
			return undefined;
		}
		const id = partial.data[section][0]?.id;
		if (
			id === undefined ||
			!rubric[section].some((expected) => expected.id === id) ||
			returned.get(section)?.has(id) === true
		) {
			return undefined;
		}
		try {
			checkItem(partial.data);
		} catch {
			return undefined;
		}

		return id;
	};
	const itemClosed = (closed: ClosedItem): void => {
		const known = progressSectionSchema.safeParse(closed.section);
		if (!known.success) {
			return;
		}
		const id = passedChecks(known.data, closed);
		if (id !== undefined) {
			returned.get(known.data)?.add(id);
			report(returning());
		}
	};

	return {
		invoke: (prompt) => {
			attempt += 1;
			startOver();
			const stream = new StructuredOutputStream({
				itemClosed,
				restarted: startOver,
			});

			return invoke(prompt, (line) => {
				// Progress is a reading of the session, never part of its result,
				// so a line it cannot read or record leaves the judge running.
				try {
					stream.line(line);
				} catch {
					// The next line reports again.
				}
			});
		},
		rejected: (reason) => {
			report({ state: "rejected", attempt, reason });
		},
	};
}
