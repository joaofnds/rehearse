import { basename, dirname, relative } from "node:path";
import type { RecordedEvidenceFile } from "./session-history-reader";
import {
	verifiedDirectory,
	verifiedFile,
	readVerifiedFile,
	SessionHistoryReaderError,
} from "./session-history-reader";

/** A path built from run-layout and parsed identities has no recorded-path root marker. */
export async function readConstructedEvidenceFile(
	root: string,
	file: string,
): Promise<RecordedEvidenceFile> {
	const directory = await verifiedDirectory(
		root,
		relative(root, dirname(file))
			.split("/")
			.filter((segment) => segment !== ""),
	);
	const verified = await verifiedFile(root, directory, basename(file), true);
	if (verified === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved evidence is missing",
		);
	}

	return { path: verified, text: await readVerifiedFile(root, verified) };
}
