import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	attemptText,
	groupText,
	repText,
} from "#server/comparison-history-records-test-fixture";

import type { ComparisonAttemptLinkRequest } from "./comparison-history-links";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

function digest(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

interface RecordedSessionAttempt {
	readonly root: string;
	readonly runsDirectory: string;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly repPaths: ReturnType<
		ReturnType<typeof confirmationGroupPaths>["rep"]
	>;
	readonly groupText: string;
	readonly repText: string;
	readonly attemptText: string;
	readonly recorded: (path: string) => string;
	readonly request: ComparisonAttemptLinkRequest;
}

async function recordSessionAttempt(
	savedRunsDirectory?: string,
): Promise<RecordedSessionAttempt> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-comparison-history-"));
	roots.push(root);
	const runsDirectory = savedRunsDirectory ?? join(root, ".benchmark-runs");
	const paths = confirmationGroupPaths(runsDirectory, "group-a");
	const repPaths = paths.rep("group-a-rep-1");
	await writeSessionHistoryFiles(paths, repPaths);
	const manifestDirectory = join(root, "manifests", "nested");
	const recorded = (path: string): string => relative(manifestDirectory, path);
	const request = {
		caseId: "case-a",
		group: { path: recorded(paths.groupFile), sha256: digest(groupText) },
		rep: {
			attempt: {
				path: recorded(repPaths.attemptFile),
				sha256: digest(attemptText),
			},
			ordinal: 1,
			path: recorded(repPaths.recordFile),
			repId: "group-a-rep-1",
			sha256: digest(repText),
		},
		runsDirectory,
	};

	return {
		attemptText,
		groupText,
		paths,
		recorded,
		repPaths,
		repText,
		request,
		root,
		runsDirectory,
	};
}

async function clearHistoryLinkRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function writeSessionHistoryFiles(
	paths: RecordedSessionAttempt["paths"],
	repPaths: RecordedSessionAttempt["repPaths"],
): Promise<void> {
	await mkdir(repPaths.directory, { recursive: true });
	await Bun.write(paths.groupFile, groupText);
	await Bun.write(repPaths.recordFile, repText);
	await Bun.write(repPaths.attemptFile, attemptText);
	await Bun.write(
		repPaths.transcriptFile,
		`${JSON.stringify({ message: { content: "saved" }, type: "assistant" })}\n`,
	);
}

export { digest, recordSessionAttempt, clearHistoryLinkRoots };

export type { RecordedSessionAttempt };
