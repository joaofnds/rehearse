import { join } from "node:path";

import type { HashedFile } from "./checkpoint-lineage";
import { hashFile } from "./checkpoint-lineage";
import type { CheckpointRecord } from "./checkpoint-record";
import parseCheckpointRecord from "./checkpoint-record";
import { hashDirectory } from "./directory-tree-walk";
import { copyWorkflowState, existingWorkflowEntries } from "./workflow-state";

const RECORD_FILE = "checkpoint.json";

const SNAPSHOT_DIRECTORY = "workflow-state";

interface CheckpointPaths {
	readonly record: string;
	readonly snapshot: string;
}

function checkpointPaths(directory: string): CheckpointPaths {
	return {
		record: join(directory, RECORD_FILE),
		snapshot: join(directory, SNAPSHOT_DIRECTORY),
	};
}

async function hashWorkflowState(
	targetDir: string,
): Promise<readonly HashedFile[]> {
	const files: HashedFile[] = [];

	await Array.fromAsync(
		await existingWorkflowEntries(targetDir),
		async (entry) => {
			if (entry.isDirectory) {
				files.push(
					...(await hashDirectory(entry.absolutePath, entry.path, {
						rootMayBeALink: false,
					})),
				);
			} else {
				files.push({
					path: entry.path,
					sha256: await hashFile(entry.absolutePath),
				});
			}
		},
	);

	return files;
}

async function readCheckpointRecord(
	directory: string,
): Promise<CheckpointRecord> {
	return parseCheckpointRecord(
		await Bun.file(join(directory, RECORD_FILE)).text(),
	);
}

interface SnapshotManifestInputs {
	readonly files: readonly HashedFile[];
}

class SnapshotManifest {
	private readonly remaining: Map<string, string>;

	public constructor({ files }: SnapshotManifestInputs) {
		this.remaining = new Map(files.map((file) => [file.path, file.sha256]));
	}

	public accept(file: HashedFile): void {
		const expected = this.remaining.get(file.path);
		if (expected === undefined) {
			throw new Error(
				`Checkpoint snapshot does not match its record: ${file.path} is not recorded`,
			);
		}

		if (file.sha256 !== expected) {
			throw new Error(
				`Checkpoint snapshot does not match its record: ${file.path} hashes ${file.sha256}, recorded ${expected}`,
			);
		}

		this.remaining.delete(file.path);
	}

	public requireComplete(): void {
		const missing = this.remaining.keys().next();
		if (missing.done !== true) {
			throw new Error(
				`Checkpoint snapshot does not match its record: ${missing.value} is recorded but missing`,
			);
		}
	}
}

async function verifyWorkflowSnapshot(
	snapshot: string,
	files: readonly HashedFile[],
): Promise<void> {
	const manifest = new SnapshotManifest({ files });

	for (const file of await hashWorkflowState(snapshot)) {
		manifest.accept(file);
	}

	manifest.requireComplete();
}

async function materializeCheckpoint(
	directory: string,
	destination: string,
): Promise<CheckpointRecord> {
	const record = await readCheckpointRecord(directory);
	const snapshot = join(directory, SNAPSHOT_DIRECTORY);

	await verifyWorkflowSnapshot(snapshot, record.workflowState);
	await copyWorkflowState(snapshot, destination);

	return record;
}

export {
	checkpointPaths,
	hashWorkflowState,
	readCheckpointRecord,
	materializeCheckpoint,
};
