import { join } from "node:path";

import { normalizeContextEvidence } from "./context-evidence";
import {
	installCorpusOverlay,
	seededProjectFiles,
} from "./session-attempt-context";
import type {
	AttemptPreparation,
	PreparedAttempt,
	SessionAttemptRequest,
} from "./session-attempt-preparation-contract";
import { projectSlug } from "./session-capture";
import seedFixture from "./session-fixture";
import { scorerFiles } from "./session-state-check";
import { prepareSession } from "./session-transcript-prefix";

async function prepareAttempt(
	request: SessionAttemptRequest,
	{ sessionCase, settings, attemptDirectory }: AttemptPreparation,
): Promise<PreparedAttempt> {
	if (sessionCase.fixturePath !== undefined) {
		await seedFixture(
			sessionCase.fixturePath,
			attemptDirectory,
			sessionCase.stateCheck === undefined
				? []
				: await scorerFiles(
						sessionCase.fixturePath,
						sessionCase.stateCheck.command,
					),
		);
	}

	const startingProjectFiles = await seededProjectFiles(
		sessionCase.projectFiles,
		attemptDirectory,
	);
	const overlay = await installCorpusOverlay(
		request.corpusSnapshot,
		attemptDirectory,
	);

	const slug = join(request.projectsDirectory, projectSlug(attemptDirectory));
	const session = await prepareSession(sessionCase, slug);
	const transcriptPath = join(slug, `${session.sessionId}.jsonl`);
	const contextEvidence =
		request.contextEvidenceSource === undefined
			? undefined
			: normalizeContextEvidence(
					request.contextEvidenceSource,
					request.contextRateCatalog,
				);

	return {
		attemptDirectory,
		contextEvidence,
		overlay,
		request,
		session,
		sessionCase,
		settings,
		slug,
		startingProjectFiles,
		transcriptPath,
	};
}

export { prepareAttempt as default };
