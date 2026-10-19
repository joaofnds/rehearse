import { isCaseId } from "#benchmark/case";
import { UsageError } from "#cli/command-usage";

import type { IdBody } from "./record-id-contract";

const PAIR_ITEM_COUNT = 2;
const THREE_SEGMENT_ID_LENGTH = 3;

function confined(id: IdBody, text: string): string {
	if (text === "." || text === ".." || text.includes("/")) {
		throw new UsageError(
			`Record id ${id.given} names a path outside the runs directory`,
		);
	}

	return text;
}

function segment(id: IdBody): string {
	if (id.body === "") {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return confined(id, id.body);
}

/**
 * A `case:` id names a directory under `cases/`, so it answers to what a case
 * id is rather than only to confinement: `case show` refuses the same mistake
 * with the same sentence, and an id `show` accepts must be one `case show`
 * would have accepted.
 */
interface CaseIdRequest {
	readonly given: string;
	readonly caseId: string;
}
function checkedCaseId({ given, caseId }: CaseIdRequest): string {
	if (!isCaseId(caseId)) {
		throw new UsageError(
			`Record id ${given} names no case: a case id is lowercase letters, digits, or dashes`,
		);
	}

	return caseId;
}

function caseSegment(id: IdBody): string {
	return checkedCaseId({ caseId: segment(id), given: id.given });
}

function twoSegments(id: IdBody): readonly [string, string] {
	const parts = id.body.split("/");
	const [first, second] = parts;
	if (
		parts.length !== PAIR_ITEM_COUNT ||
		first === undefined ||
		first === "" ||
		second === undefined ||
		second === ""
	) {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return [confined(id, first), confined(id, second)];
}

function threeSegments(id: IdBody): readonly [string, string, string] {
	const parts = id.body.split("/");
	const [first, second, third] = parts;
	if (
		parts.length !== THREE_SEGMENT_ID_LENGTH ||
		first === undefined ||
		first === "" ||
		second === undefined ||
		second === "" ||
		third === undefined ||
		third === ""
	) {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return [confined(id, first), confined(id, second), confined(id, third)];
}

export { caseSegment, checkedCaseId, segment, threeSegments, twoSegments };
