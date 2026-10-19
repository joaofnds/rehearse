import { dirname, join } from "node:path";

import type { SessionCaseDeclaration } from "./case";
import { parseCaseDeclaration } from "./case";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import type {
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import { SESSION_CONFIRMATION_RECORD_VERSION } from "./session-comparison-test-contract";

interface RecordedSessionRep {
	readonly rep: Immutable<SessionConfirmationRepRecord>;
	readonly repPath: string;
	readonly repText: string;
	readonly stage: Immutable<SessionConfirmationRepRecord["stages"][number]>;
	readonly attemptPath: string;
}

interface RepReference {
	readonly groupFile: string;
	readonly reference: SessionConfirmationGroupRecord["repRecords"][number];
}

async function readSessionGroup(
	groupFile: string,
): Promise<Immutable<SessionConfirmationGroupRecord>> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	if (
		group.schemaVersion !== SESSION_CONFIRMATION_RECORD_VERSION ||
		group.mode !== "session"
	) {
		throw new Error("session fixture group has an unexpected record shape");
	}

	return group;
}

async function recordedSessionRep({
	groupFile,
	reference,
}: RepReference): Promise<RecordedSessionRep> {
	const repPath = join(dirname(groupFile), reference.path);
	const repText = await Bun.file(repPath).text();
	const rep = parseConfirmationRepRecord(repText);
	if (
		rep.schemaVersion !== SESSION_CONFIRMATION_RECORD_VERSION ||
		rep.mode !== "session"
	) {
		throw new Error("session fixture group has an unexpected rep shape");
	}

	const [stage] = rep.stages;
	if (stage === undefined) {
		throw new Error("session fixture rep has no checks stage");
	}

	return {
		attemptPath: join(dirname(repPath), stage.evidence.recordFile),
		rep,
		repPath,
		repText,
		stage,
	};
}

async function firstRecordedSessionRep(
	groupFile: string,
): Promise<RecordedSessionRep> {
	const group = await readSessionGroup(groupFile);
	const [reference] = group.repRecords;
	if (reference === undefined) {
		throw new Error("expected a rep reference");
	}

	return await recordedSessionRep({ groupFile, reference });
}

interface FrozenSessionCase {
	readonly casePath: string;
	readonly declaration: SessionCaseDeclaration;
}

async function readFrozenSessionCase(
	groupFile: string,
): Promise<FrozenSessionCase> {
	const group = await readSessionGroup(groupFile);
	const caseFile = group.inputs.files.find(({ kind }) => kind === "case");
	if (caseFile === undefined) {
		throw new Error("session fixture group has no frozen case file");
	}

	const casePath = join(dirname(groupFile), caseFile.path);
	const declaration = parseCaseDeclaration(
		group.caseId,
		await Bun.file(casePath).text(),
	);
	if (declaration.kind !== "session") {
		throw new Error("expected a session case");
	}

	return { casePath, declaration };
}

interface RecordedCorpusInput {
	readonly group: Immutable<SessionConfirmationGroupRecord>;
	readonly corpusFile: Immutable<
		SessionConfirmationGroupRecord["inputs"]["files"][number]
	>;
}

async function firstRecordedCorpus(
	groupFile: string,
): Promise<RecordedCorpusInput> {
	const group = await readSessionGroup(groupFile);
	const corpusFile = group.inputs.files.find(({ kind }) => kind === "corpus");
	if (corpusFile === undefined) {
		throw new Error("expected a frozen corpus file");
	}

	return { corpusFile, group };
}

export {
	firstRecordedCorpus,
	firstRecordedSessionRep,
	readFrozenSessionCase,
	readSessionGroup,
	recordedSessionRep,
};

export type { RecordedSessionRep };
