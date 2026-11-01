import { basename, dirname, relative } from "node:path";

import type { RecordedEvidenceFile } from "./session-history-reader";
import {
	SessionHistoryReaderError,
	readVerifiedBytes,
	verifiedDirectory,
	verifiedFile,
} from "./session-history-reader";

interface ConstructedEvidenceFile extends RecordedEvidenceFile {
	readonly sourceSha256: string;
}

/** A path built from run-layout and parsed identities has no recorded-path root marker. */
async function readConstructedEvidenceFile(
	root: string,
	file: string,
): Promise<ConstructedEvidenceFile> {
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

	const bytes = await readVerifiedBytes(root, verified);
	return {
		path: verified,
		sourceSha256: Bun.CryptoHasher.hash("sha256", bytes, "hex"),
		text: Buffer.from(bytes).toString("utf8"),
	};
}

export { readConstructedEvidenceFile as default };

export type { ConstructedEvidenceFile };
