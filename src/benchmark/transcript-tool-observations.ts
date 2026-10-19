import type { z } from "zod";

import type { Immutable } from "./contracts";
import type {
	observedToolUseCountsSchema,
	toolErrorSchema,
} from "./transcript-diagnostics-contract";
import type {
	LocatedToolResult,
	LocatedToolUse,
	LocatedToolUseMap,
} from "./transcript-line-contract";

const TOOL_USE_COUNT_INCREMENT = 1;

const NO_TOOL_USE_OCCURRENCES = 0;
const SINGLE_ITEM_COUNT = 1;

function countToolUses(
	uses: Immutable<readonly LocatedToolUse[]>,
): z.infer<typeof observedToolUseCountsSchema> {
	const byName = new Map<string, number>();
	for (const { use } of uses) {
		byName.set(
			use.name,
			(byName.get(use.name) ?? NO_TOOL_USE_OCCURRENCES) +
				TOOL_USE_COUNT_INCREMENT,
		);
	}

	return {
		byName: [...byName].map(([name, count]) => ({ count, name })),
		total: uses.length,
	};
}

function observedErrors(
	results: Immutable<readonly LocatedToolResult[]>,
	usesById: LocatedToolUseMap,
): z.infer<typeof toolErrorSchema>[] {
	const errors: z.infer<typeof toolErrorSchema>[] = [];
	for (const result of results) {
		if (result.isError) {
			errors.push(observedToolError(result, usesById));
		}
	}

	return errors;
}

function observedToolError(
	result: Immutable<LocatedToolResult>,
	usesById: LocatedToolUseMap,
): z.infer<typeof toolErrorSchema> {
	const matches =
		result.toolUseId === undefined
			? []
			: (usesById.get(result.toolUseId) ?? []);
	const [match] = matches.length === SINGLE_ITEM_COUNT ? matches : [];
	const observed: z.infer<typeof toolErrorSchema> = {
		result: result.location,
	};
	if (result.toolUseId !== undefined) {
		observed.toolUseId = result.toolUseId;
	}
	if (match !== undefined) {
		observed.toolName = match.use.name;
		observed.call = match.location;
	}
	return observed;
}

export { observedErrors, countToolUses };
