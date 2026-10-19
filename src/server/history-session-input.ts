import { relative } from "node:path";

import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import type {
	AttemptReadings,
	ResolvedAttemptInput,
} from "#server/history-input-contract";
import { SessionHistoryReaderError } from "#server/history-read-identity";
import type {
	ConfirmationAttemptHistoryIdentity,
	SessionAttemptHistoryIdentity,
} from "#server/history-read-identity";
import { readVerifiedFile } from "#server/history-verified-file";
import {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedFile,
} from "#server/history-verified-path";

async function reportMetadata(
	root: string,
	attemptFile: string,
	id: string,
): Promise<AttemptReadings> {
	const attempt = parseSessionAttemptRecord(
		await readVerifiedFile(root, attemptFile),
	);

	return {
		metadata: {
			attempt: {
				caseId: attempt.caseId,
				corpusFiles: attempt.corpusFiles.map(({ path, resolvedPath }) => ({
					path,
					resolvedPath,
				})),
				id,
				kind: "session",
				model: attempt.model,
				outcome: attempt.outcome,
			},
			diagnostics: attempt.transcriptDiagnostics,
			prefixLinesExcluded: attempt.transcriptDiagnostics?.prefixLinesExcluded,
			resolvedCorpusFiles: attempt.corpusFiles.map(
				({ path, resolvedPath }) => ({ path, resolvedPath }),
			),
		},
		modelUsage: attempt.metrics?.modelUsage,
		reportedCostUsd: attempt.metrics?.costUsd,
	};
}

async function standaloneInput(
	identity: Readonly<SessionAttemptHistoryIdentity>,
): Promise<ResolvedAttemptInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const directory = await verifiedDirectory(root, [
		"sessions",
		identity.caseId,
		identity.uuid,
	]);
	const attemptFile = await verifiedFile(root, {
		directory,
		name: "attempt.json",
		required: true,
	});
	if (attemptFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved attempt is unavailable",
		);
	}

	const transcriptFile = await verifiedFile(root, {
		directory,
		name: "transcript.jsonl",
		required: false,
	});
	const { metadata, reportedCostUsd, modelUsage } = await reportMetadata(
		root,
		attemptFile,
		identity.uuid,
	);
	if (metadata.attempt.caseId !== identity.caseId) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved attempt does not own this case identity",
		);
	}

	return {
		directory,
		metadata,
		modelUsage,
		reportedCostUsd,
		root,
		transcriptFile,
	};
}

interface ConfirmationFiles {
	readonly root: string;
	readonly groupDirectory: string;
	readonly repDirectory: string;
	readonly groupFile: string;
	readonly repFile: string;
	readonly attemptFile: string;
}

interface ConfirmationRecords {
	readonly group: ReturnType<typeof parseConfirmationGroupRecord>;
	readonly rep: ReturnType<typeof parseConfirmationRepRecord>;
}

async function confirmationFiles(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
): Promise<ConfirmationFiles> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const groupDirectory = await verifiedDirectory(root, [
		"confirmations",
		identity.groupId,
	]);
	const repDirectory = await verifiedDirectory(root, [
		"confirmations",
		identity.groupId,
		"reps",
		identity.repId,
	]);
	const groupFile = await verifiedFile(root, {
		directory: groupDirectory,
		name: "group.json",
		required: true,
	});
	const repFile = await verifiedFile(root, {
		directory: repDirectory,
		name: "rep.json",
		required: true,
	});
	const attemptFile = await verifiedFile(root, {
		directory: repDirectory,
		name: "attempt.json",
		required: true,
	});

	return {
		attemptFile,
		groupDirectory,
		groupFile,
		repDirectory,
		repFile,
		root,
	};
}

async function confirmationRecords(
	root: string,
	files: ConfirmationFiles,
): Promise<ConfirmationRecords> {
	const group = parseConfirmationGroupRecord(
		await readVerifiedFile(root, files.groupFile),
	);
	const rep = parseConfirmationRepRecord(
		await readVerifiedFile(root, files.repFile),
	);

	return { group, rep };
}

async function confirmationInput(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
): Promise<ResolvedAttemptInput> {
	const files = await confirmationFiles(identity);
	const { group, rep } = await confirmationRecords(files.root, files);
	if (group.mode !== "session" || rep.mode !== "session") {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation attempt is not a session",
		);
	}

	if (
		group.groupId !== identity.groupId ||
		rep.groupId !== identity.groupId ||
		rep.repId !== identity.repId ||
		!group.repRecords.some(
			(reference) =>
				reference.repId === identity.repId &&
				reference.path === relative(files.groupDirectory, files.repFile),
		)
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation group does not own this rep",
		);
	}

	const input = await confirmationReading(files, identity.repId);
	if (
		input.metadata.attempt.caseId !== group.caseId ||
		input.metadata.attempt.caseId !== rep.caseId
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation attempt case identity differs",
		);
	}

	return input;
}

async function confirmationReading(
	files: ConfirmationFiles,
	repId: string,
): Promise<ResolvedAttemptInput> {
	const { root } = files;
	const transcriptFile = await verifiedFile(root, {
		directory: files.repDirectory,
		name: "transcript.jsonl",
		required: false,
	});
	const { metadata, reportedCostUsd, modelUsage } = await reportMetadata(
		root,
		files.attemptFile,
		repId,
	);

	return {
		directory: files.repDirectory,
		metadata,
		modelUsage,
		reportedCostUsd,
		root,
		transcriptFile,
	};
}

export { reportMetadata, standaloneInput, confirmationInput };
