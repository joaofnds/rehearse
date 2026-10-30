import { join } from "node:path";

import type { SessionCase } from "./case";
import { normalizeContextEvidence } from "./context-evidence";
import type { ContextEvidence } from "./context-evidence";
import {
	installCorpusOverlay,
	seededProjectFiles,
} from "./session-attempt-context";
import type {
	AttemptPreparation,
	PreparedAttempt,
	SessionAttemptRequest,
} from "./session-attempt-preparation-contract";
import preparedSetup from "./session-attempt-setup";
import { projectSlug } from "./session-capture";
import seedFixture from "./session-fixture";
import { scorerFiles } from "./session-state-check";
import { prepareSession } from "./session-transcript-prefix";

function attemptContextEvidence(
	request: SessionAttemptRequest,
): ContextEvidence | undefined {
	return request.contextEvidenceSource === undefined
		? undefined
		: normalizeContextEvidence(
				request.contextEvidenceSource,
				request.contextRateCatalog,
			);
}

async function seedAttemptFixture(
	sessionCase: SessionCase,
	attemptDirectory: string,
): Promise<void> {
	if (sessionCase.fixturePath === undefined) {
		return;
	}

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

async function prepareAttempt(
	request: SessionAttemptRequest,
	{
		sessionCase,
		settings,
		attemptDirectory,
		setupDirectory,
	}: AttemptPreparation,
): Promise<PreparedAttempt> {
	await seedAttemptFixture(sessionCase, attemptDirectory);

	const startingProjectFiles = await seededProjectFiles(
		sessionCase.projectFiles,
		attemptDirectory,
	);
	const overlay = await installCorpusOverlay(request, attemptDirectory);

	const setup = await preparedSetup(request, {
		sessionCase,
		setupDirectory,
		styleName: overlay.styleName,
	});

	const slug = join(request.projectsDirectory, projectSlug(attemptDirectory));
	const session = await prepareSession(sessionCase, slug);
	const transcriptPath = join(slug, `${session.sessionId}.jsonl`);
	const contextEvidence = attemptContextEvidence(request);

	return {
		attemptDirectory,
		contextEvidence,
		overlay,
		request,
		session,
		sessionCase,
		settings,
		setup,
		setupDirectory,
		slug,
		startingProjectFiles,
		transcriptPath,
	};
}

export { prepareAttempt as default };
