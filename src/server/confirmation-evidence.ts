import type { Immutable } from "#benchmark/contracts";
import { ZodError } from "zod";
import { relative, dirname } from "node:path";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type {
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { readConstructedEvidenceFile } from "./constructed-evidence-file";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { SessionHistoryReaderError } from "./session-history-reader";

interface OwnedConfirmationRep {
	readonly group: Immutable<ParsedConfirmationGroupRecord>;
	readonly rep: Immutable<ParsedConfirmationRepRecord>;
}
function parseMetadata<Value>(
	text: string,
	parser: (text: string) => Value,
	label: "group" | "repetition",
): Value {
	try {
		return parser(text);
	} catch (error) {
		if (error instanceof ZodError || error instanceof SyntaxError) {
			throw new SessionHistoryReaderError(
				"refused",
				`The saved ${label} metadata could not be read.`,
			);
		}
		throw error;
	}
}
/** The group reference owns the exact rep file, its ordinal, case and execution mode. */
export async function readOwnedConfirmationRep(
	root: string,
	groupId: string,
	repId: string,
): Promise<OwnedConfirmationRep> {
	const paths = confirmationGroupPaths(root, groupId);
	const repPaths = paths.rep(repId);
	const groupFile = await readConstructedEvidenceFile(root, paths.groupFile);
	const repFile = await readConstructedEvidenceFile(root, repPaths.recordFile);
	const group = parseMetadata(
		groupFile.text,
		parseConfirmationGroupRecord,
		"group",
	);
	const rep = parseMetadata(
		repFile.text,
		parseConfirmationRepRecord,
		"repetition",
	);
	const owned = group.repRecords.some(
		(reference) =>
			reference.repId === repId &&
			reference.ordinal === rep.ordinal &&
			reference.path === relative(dirname(groupFile.path), repFile.path),
	);
	if (
		group.groupId !== groupId ||
		rep.groupId !== groupId ||
		rep.repId !== repId ||
		group.caseId !== rep.caseId ||
		group.mode !== rep.mode ||
		!owned
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved group does not own this repetition identity, case and mode.",
		);
	}
	return { group, rep };
}
