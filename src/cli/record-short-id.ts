import { UsageError } from "#cli/command-usage";

import type { ShortIdReference } from "./record-id-contract";
import { SHORT_ID_FORMS } from "./record-id-forms";
import { checkedCaseId } from "./record-id-segments";

const NO_EXTRA_ID_SEGMENTS = 0;

const SHORT_NUMBER = /^(?<letter>[rg])(?<number>[1-9]\d*)$/u;

const SHORT_STAGE = /^s(?<stage>0|[1-9]\d*)$/u;

/**
 * The case segment is checked before anything else is read from the id, since
 * it names a directory under the registry and `../x/r1` would otherwise name
 * one outside it.
 */

interface ShortClaim {
	readonly number: number;
	readonly shortKind: ShortIdReference["shortKind"];
}

function claimedShortId(numbered: string): ShortClaim | undefined {
	const claimed = SHORT_NUMBER.exec(numbered)?.groups;
	if (claimed?.["letter"] === undefined || claimed["number"] === undefined) {
		return undefined;
	}

	return {
		number: Number(claimed["number"]),
		shortKind: claimed["letter"] === "g" ? "group" : "run",
	};
}

interface ShortStageRequest {
	readonly given: string;
	readonly shortKind: ShortIdReference["shortKind"];
	readonly staged: string | undefined;
	readonly extra: readonly string[];
}
function malformedShortId(text: string): UsageError {
	return new UsageError(
		`Record id ${text} takes the form ${SHORT_ID_FORMS.join(", ")}`,
	);
}
function shortStage({
	given,
	shortKind,
	staged,
	extra,
}: ShortStageRequest): number | undefined {
	if (staged === undefined) {
		return undefined;
	}

	const stage = SHORT_STAGE.exec(staged)?.groups?.["stage"];
	if (
		shortKind !== "run" ||
		stage === undefined ||
		extra.length > NO_EXTRA_ID_SEGMENTS
	) {
		throw malformedShortId(given);
	}

	return Number(stage);
}
function parseShortId(text: string): ShortIdReference {
	const [caseText = "", numbered = "", staged, ...extra] = text.split("/");
	const caseId = checkedCaseId({ caseId: caseText, given: text });
	const claimed = claimedShortId(numbered);
	if (claimed === undefined) {
		throw malformedShortId(text);
	}

	const stage = shortStage({
		extra,
		given: text,
		shortKind: claimed.shortKind,
		staged,
	});
	if (stage === undefined) {
		return {
			caseId,
			kind: "short",
			number: claimed.number,
			shortKind: claimed.shortKind,
		};
	}

	return {
		caseId,
		kind: "short",
		number: claimed.number,
		shortKind: claimed.shortKind,
		stage,
	};
}

export { parseShortId as default };
