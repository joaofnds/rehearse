import { basename, dirname, relative } from "node:path";

import type { RecordedEvidenceFile } from "./session-history-reader";
import {
	SessionHistoryReaderError,
	readVerifiedFile,
	verifiedDirectory,
	verifiedFile,
} from "./session-history-reader";

/** A path built from run-layout and parsed identities has no recorded-path root marker. */
async function readConstructedEvidenceFile(
	root: string,
	file: string,
): Promise<RecordedEvidenceFile> {
	const directory = await verifiedDirectory(
		root,
		relative(root, dirname(file))
			.split("/")
			.filter((segment) => segment !== ""),
	);
	const verified = await verifiedFile(root, {
		directory,
		name: basename(file),
		required: true,
	});
	if (verified === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved evidence is missing",
		);
	}

	return { path: verified, text: await readVerifiedFile(root, verified) };
}

export { readConstructedEvidenceFile as default };
