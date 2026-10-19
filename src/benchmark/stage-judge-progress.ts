import { z } from "zod";

import type { StageJudgeResponse, StageRubric } from "./contracts";
import { stageJudgeResponseSchema } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import type { ClosedItem } from "./judge-stream";
import StructuredOutputStream from "./judge-stream";
import type {
	JudgeProgress,
	JudgeSectionCount,
	ReturnedItems,
} from "./run-events";

const NO_RETURNED_JUDGE_ITEMS = 0;

const JUDGE_ATTEMPT_ORDINAL_STEP = 1;

/**
 * Runs the judge with its output streamed, handing each output line to
 * `onLine` as it arrives, and resolves to the session's result envelope.
 */
type StageJudgeInvoker = (
	prompt: string,
	onLine: (line: string) => void,
	budgetUsd: number,
) => Promise<string>;

const PROGRESS_SECTIONS = [
	"hardBlockers",
	"requirements",
	"dimensions",
] as const;
type ProgressSection = (typeof PROGRESS_SECTIONS)[number];
const progressSectionSchema = z.enum(PROGRESS_SECTIONS);

/** What one returned item said: a status for a blocker or requirement, a grade for a dimension. */
type ItemResult = Pick<ReturnedItems["hardBlockers"][number], "status"> &
	Pick<ReturnedItems["dimensions"][number], "grade">;

function itemResult(
	item: StageJudgeResponse[ProgressSection][number],
): ItemResult {
	return "grade" in item ? { grade: item.grade } : { status: item.status };
}

interface JudgeProgressWatch {
	readonly invoke: JudgeInvoker;
	readonly rejected: (reason: string) => void;
}
interface StageJudgeProgressObserver {
	readonly rubric: StageRubric;
	readonly checkItem: (partial: StageJudgeResponse) => void;
	readonly report: (progress: JudgeProgress) => void;
}

const INITIAL_JUDGE_ATTEMPT = 0;
class StageJudgeProgress {
	private attempt = INITIAL_JUDGE_ATTEMPT;
	private returned = new Map<ProgressSection, Map<string, ItemResult>>();
	public constructor(
		private readonly invokeSession: StageJudgeInvoker,
		private readonly observer: StageJudgeProgressObserver,
	) {}
	public readonly invoke: JudgeInvoker = async (prompt, budgetUsd) => {
		this.attempt += JUDGE_ATTEMPT_ORDINAL_STEP;
		this.startOver();
		const stream = new StructuredOutputStream({
			itemClosed: this.itemClosed.bind(this),
			restarted: () => {
				this.startOver();
			},
		});

		const { invokeSession } = this;
		const resolved = await invokeSession(
			prompt,
			(line) => {
				try {
					stream.line(line);
				} catch {
					// The stream reads on from the next line.
				}
			},
			budgetUsd,
		);

		return resolved;
	};
	public readonly rejected = (reason: string): void => {
		this.reportSafely({ attempt: this.attempt, reason, state: "rejected" });
	};
	private reportSafely(progress: JudgeProgress): void {
		try {
			const { report } = this.observer;
			report(progress);
		} catch {
			// The next reading is reported afresh.
		}
	}
	private returning(): JudgeProgress {
		const count = (section: ProgressSection): JudgeSectionCount => ({
			returned: this.returned.get(section)?.size ?? NO_RETURNED_JUDGE_ITEMS,
			total: this.observer.rubric[section].length,
		});

		return {
			attempt: this.attempt,
			items: {
				dimensions: this.observer.rubric.dimensions.map(({ id }) => {
					const grade = this.returned.get("dimensions")?.get(id)?.grade;

					return grade === undefined ? { id } : { grade, id };
				}),
				hardBlockers: this.observer.rubric.hardBlockers.map(({ id }) => {
					const status = this.returned.get("hardBlockers")?.get(id)?.status;

					return status === undefined ? { id } : { id, status };
				}),
			},
			sections: {
				dimensions: count("dimensions"),
				hardBlockers: count("hardBlockers"),
				requirements: count("requirements"),
			},
			state: "returning",
		};
	}
	private startOver(): void {
		this.returned = new Map(
			PROGRESS_SECTIONS.map((section) => [
				section,
				new Map<string, ItemResult>(),
			]),
		);
		this.reportSafely(this.returning());
	}
	private passedChecks(
		section: ProgressSection,
		{ item }: ClosedItem,
	): StageJudgeResponse[ProgressSection][number] | undefined {
		const partial = stageJudgeResponseSchema.safeParse({
			dimensions: [],
			hardBlockers: [],
			requirements: [],
			summary: "in progress",
			[section]: [item],
		});
		if (!partial.success) {
			return undefined;
		}

		const [parsed] = partial.data[section];
		if (
			parsed === undefined ||
			!this.observer.rubric[section].some(
				(expected) => expected.id === parsed.id,
			) ||
			this.returned.get(section)?.has(parsed.id) === true
		) {
			return undefined;
		}

		if (!this.acceptedByCaller(partial.data)) {
			return undefined;
		}

		return parsed;
	}
	private acceptedByCaller(partial: StageJudgeResponse): boolean {
		const { checkItem } = this.observer;
		try {
			checkItem(partial);
			return true;
		} catch {
			return false;
		}
	}

	private itemClosed(closed: ClosedItem): void {
		const known = progressSectionSchema.safeParse(closed.section);
		if (!known.success) {
			return;
		}

		const parsed = this.passedChecks(known.data, closed);
		if (parsed !== undefined) {
			this.returned.get(known.data)?.set(parsed.id, itemResult(parsed));
			this.reportSafely(this.returning());
		}
	}
}
/**
 * Counts the judge's items per rubric section as its streamed output closes
 * each one, reporting the counts, and each returned blocker's status and
 * dimension's grade, before any grade exists. An item counts only
 * once it is a rubric id not yet returned and passes `checkItem`, which the
 * caller gives the checks the whole output will face.
 */
function watchJudgeProgress(
	invoke: StageJudgeInvoker,
	{ rubric, checkItem, report }: StageJudgeProgressObserver,
): JudgeProgressWatch {
	const progress = new StageJudgeProgress(invoke, {
		checkItem,
		report,
		rubric,
	});
	return { invoke: progress.invoke, rejected: progress.rejected };
}

export { watchJudgeProgress as default };
export type { StageJudgeInvoker, JudgeProgressWatch };
