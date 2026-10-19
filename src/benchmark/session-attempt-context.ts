import { join } from "node:path";

import type { SessionCase } from "./case";
import type { HashedFile } from "./checkpoint";
import { hashFile } from "./checkpoint";
import type { CorpusReadRoots } from "./context-manifest";
import { observedManifest } from "./context-manifest";
import { liveCorpusSource } from "./corpus-file";
import type {
	PreservedTranscript,
	SessionAttempt,
} from "./session-attempt-contract";
import type {
	CorpusOverlay,
	SessionAttemptRequest,
} from "./session-attempt-preparation-contract";
import type { SessionCorpusSnapshot } from "./session-corpus";
import {
	installSessionCorpusSnapshot,
	snapshotStyleName,
} from "./session-corpus";
import {
	corpusSourceDirectories,
	loadedProjectInstructions,
	spellings,
} from "./stage-reads";

async function sessionCorpusRoots(
	snapshot: SessionCorpusSnapshot | undefined,
	attemptDirectory: string,
	installed: readonly string[],
): Promise<CorpusReadRoots> {
	const source = snapshot ?? liveCorpusSource();
	const attemptRoots = await spellings([attemptDirectory]);

	return {
		shadow: attemptRoots.map((root) => join(root, ".claude")),
		shadowed: installed,
		sources:
			source.kind === "live"
				? await spellings(corpusSourceDirectories(source))
				: [],
	};
}

async function installCorpusOverlay(
	snapshot: SessionCorpusSnapshot | undefined,
	attemptDirectory: string,
): Promise<CorpusOverlay> {
	if (snapshot === undefined) {
		return { installed: [], styleName: undefined };
	}

	return {
		installed: await installSessionCorpusSnapshot(snapshot, attemptDirectory),
		styleName: snapshotStyleName(snapshot),
	};
}

async function undeclaredProjectInstructions(
	sessionCase: SessionCase,
	loaded: readonly string[],
): Promise<readonly HashedFile[]> {
	if (sessionCase.fixturePath === undefined) {
		return [];
	}

	return await seededProjectFiles(
		loaded.filter((path) => !sessionCase.projectFiles.includes(path)),
		sessionCase.fixturePath,
	);
}

async function seededProjectFiles(
	projectFiles: readonly string[],
	attemptDirectory: string,
): Promise<readonly HashedFile[]> {
	const files: HashedFile[] = [];
	await Array.fromAsync(projectFiles, async (path) => {
		const file = join(attemptDirectory, path);
		if (await Bun.file(file).exists()) {
			files.push({ path, sha256: await hashFile(file) });
		}
	});

	return files;
}

interface AttemptContextEvidence {
	readonly request: Pick<
		SessionAttemptRequest,
		"sessionCase" | "corpusSnapshot"
	>;
	readonly attemptDirectory: string;
	readonly turn: PreservedTranscript["lines"];
	readonly installedCorpus: readonly string[];
}

async function readAttemptContext({
	request,
	attemptDirectory,
	turn,
	installedCorpus,
}: AttemptContextEvidence): Promise<
	Pick<SessionAttempt, "contextManifest" | "loadedProjectInstructions">
> {
	return {
		contextManifest: observedManifest(
			turn,
			request.sessionCase.projectFiles,
			await sessionCorpusRoots(
				request.corpusSnapshot,
				attemptDirectory,
				installedCorpus,
			),
		),
		loadedProjectInstructions: await loadedProjectInstructions(
			turn,
			attemptDirectory,
		),
	};
}

export {
	installCorpusOverlay,
	undeclaredProjectInstructions,
	seededProjectFiles,
	readAttemptContext,
};
