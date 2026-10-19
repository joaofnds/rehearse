import type { CaseDeclaration } from "#benchmark/case";
import projectFormatted from "#benchmark/project-format";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

function serialize(
	record: CaseDeclaration | readonly CaseDeclaration[],
): string {
	return `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`;
}

/**
 * A case declaration is committed, so it is written as the project's formatter
 * would leave it and the format check stays green without another step.
 */
async function serializeCommitted(
	declaration: CaseDeclaration,
): Promise<string> {
	return await projectFormatted(
		"case.json",
		JSON.stringify(declaration, null, "\t"),
	);
}

export { serialize, serializeCommitted };
