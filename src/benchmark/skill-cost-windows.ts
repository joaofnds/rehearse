import { basename } from "node:path";

import { z } from "zod";

import type { SkillInvoker } from "./agent-cost-contract";
import type { Participant } from "./agent-cost-participants";
import type { Immutable } from "./contracts";
import type { ToolUse, TranscriptLine } from "./transcript";

const EMPTY_COLLECTION_LENGTH = 0;

interface Invocation {
	readonly skill: string;
	readonly invokedBy: SkillInvoker;
	readonly deliveryLine: number;
}

interface Delivery {
	readonly invocations: readonly Invocation[];
	readonly request: number | undefined;
}

/**
 * Deliveries that opened together, from one request, share one window. A
 * window with no close runs to the end of the agent's transcript.
 */
interface SkillWindow {
	readonly open: number;
	readonly close: number | undefined;
	readonly request: number | undefined;
	readonly invocations: readonly Invocation[];
}

interface SkillCall {
	readonly skill: string;
	readonly request: number | undefined;
}

type RequestLocator = (line: number) => number | undefined;

const skillInputSchema = z.looseObject({ skill: z.string().nonempty() });

function skillName(
	input: Immutable<ToolUse["input"]> | undefined,
): string | undefined {
	const parsed = skillInputSchema.safeParse(input);

	return parsed.success ? parsed.data.skill : undefined;
}

function skillCalls(
	lines: Immutable<readonly TranscriptLine[]>,
	requestOf: RequestLocator,
): ReadonlyMap<string, SkillCall> {
	const calls = new Map<string, SkillCall>();

	for (const { line, locatedToolUses } of lines) {
		for (const { use, toolUseId } of locatedToolUses) {
			if (use.name === "Skill" && toolUseId !== undefined) {
				calls.set(toolUseId, {
					request: requestOf(line),
					skill: skillName(use.input) ?? "not recorded",
				});
			}
		}
	}

	return calls;
}

/**
 * A skill body answering a Skill call names the call. One loaded by a slash
 * command names none, and the skill is the directory the body opens with; a
 * row carrying several such bodies delivers each of them.
 */
function deliveryAt(
	row: Immutable<TranscriptLine>,
	calls: ReadonlyMap<string, SkillCall>,
): Delivery | undefined {
	const { line, sourceToolUseId, skillDirectories } = row;
	if (sourceToolUseId !== undefined) {
		const call = calls.get(sourceToolUseId);

		return call === undefined
			? undefined
			: {
					invocations: [
						{
							deliveryLine: line,
							invokedBy: { by: "Skill call", toolUseId: sourceToolUseId },
							skill: call.skill,
						},
					],
					request: call.request,
				};
	}

	if (skillDirectories.length === EMPTY_COLLECTION_LENGTH) {
		return undefined;
	}

	return {
		invocations: skillDirectories.map((directory) => ({
			deliveryLine: line,
			invokedBy: { by: "slash command" },
			skill: basename(directory),
		})),
		request: undefined,
	};
}

/**
 * A window opens at a skill's observed delivery and closes at the next
 * delivery from another request, the next prompt, or the end of the
 * transcript. A compaction does not close it: nothing recorded shows that a
 * compaction unloads a skill.
 */
function skillWindows(
	participant: Immutable<Participant>,
	requestOf: RequestLocator,
): readonly SkillWindow[] {
	const calls = skillCalls(participant.lines, requestOf);
	let current: SkillWindow | undefined = undefined;

	const windows = participant.lines.flatMap((row): SkillWindow[] => {
		if (row.line > participant.attemptStart) {
			const delivery = deliveryAt(row, calls);

			if (
				delivery !== undefined &&
				current?.request !== undefined &&
				current.request === delivery.request
			) {
				current = {
					...current,
					invocations: [...current.invocations, ...delivery.invocations],
				};
			} else if (
				delivery !== undefined ||
				row.userTurn === "prompt" ||
				row.userTurn === "interruption"
			) {
				const closed =
					current === undefined ? [] : [{ ...current, close: row.line }];

				current =
					delivery === undefined
						? undefined
						: {
								close: undefined,
								invocations: delivery.invocations,
								open: row.line,
								request: delivery.request,
							};

				return closed;
			}
		}

		return [];
	});

	return current === undefined ? windows : [...windows, current];
}

function windowAt(
	windows: Immutable<readonly SkillWindow[]>,
	line: number,
): SkillWindow | undefined {
	return windows.find(
		({ open, close }) => open <= line && (close === undefined || line < close),
	);
}
export { skillWindows, skillName, windowAt };
export type { SkillWindow, RequestLocator };
