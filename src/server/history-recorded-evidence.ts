import { basename, isAbsolute } from "node:path";

import { SessionHistoryReaderError } from "#server/history-read-identity";
import { readVerifiedFile } from "#server/history-verified-file";
import {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedFile,
} from "#server/history-verified-path";

const MISSING_PATH_SEGMENT_INDEX = -1;

const ROOT_MARKER_SEGMENT_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface RecordedEvidenceFile {
	readonly path: string;
	readonly text: string;
}

function withoutLeadingParents(segments: readonly string[]): string[] {
	const firstNamed = segments.findIndex((segment) => segment !== "..");
	return firstNamed === MISSING_PATH_SEGMENT_INDEX
		? []
		: segments.slice(firstNamed);
}

/** Resolve a comparison-recorded path without trusting any path component. */
async function readRecordedEvidenceFile(
	runsDirectory: string,
	recordedPath: string,
): Promise<RecordedEvidenceFile> {
	if (isAbsolute(recordedPath)) {
		throw new SessionHistoryReaderError("refused", "Recorded path is absolute");
	}

	const root = await canonicalRunsRoot(runsDirectory);
	const { name, segments } = recordedIdentity(root, recordedPath);
	const directory = await verifiedDirectory(root, segments);
	const file = await verifiedFile(root, { directory, name, required: true });
	if (file === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Recorded evidence is missing",
		);
	}

	return { path: file, text: await readVerifiedFile(root, file) };
}

interface RecordedPathIdentity {
	readonly name: string;
	readonly segments: readonly string[];
}

function recordedIdentity(
	root: string,
	recordedPath: string,
): RecordedPathIdentity {
	const recordedSegments = recordedPath.split(/[\\/]/u);
	const rootMarker = recordedSegments.lastIndexOf(basename(root));
	const segments =
		rootMarker === MISSING_PATH_SEGMENT_INDEX
			? withoutLeadingParents(
					recordedSegments.filter((segment) => segment !== "."),
				)
			: recordedSegments.slice(rootMarker + ROOT_MARKER_SEGMENT_COUNT);
	if (
		segments.length === EMPTY_COLLECTION_LENGTH ||
		segments.some(
			(segment) => segment === "" || segment === "." || segment === "..",
		)
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Recorded path has no confined runs-relative identity",
		);
	}

	const name = segments.pop();
	if (name === undefined) {
		throw new SessionHistoryReaderError("refused", "Recorded path is invalid");
	}

	return { name, segments };
}

export { readRecordedEvidenceFile as default };
export type { RecordedEvidenceFile };
