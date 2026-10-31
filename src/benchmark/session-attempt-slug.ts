import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { SessionCase } from "./case";
import { normalizeContextEvidence } from "./context-evidence";
import type { ContextEvidence } from "./context-evidence";
import type {
	SessionAttemptRequest,
	SessionNaming,
} from "./session-attempt-preparation-contract";
import { removeSessionFiles } from "./session-attempt-transcript";
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

interface SlugSession {
	readonly session: SessionNaming;
	readonly transcriptPath: string;
	readonly contextEvidence: ContextEvidence | undefined;
}

/** A resumed case's fork is in the slug from here on, so a failure removes it. */
async function sessionInSlug(
	request: SessionAttemptRequest,
	sessionCase: SessionCase,
	slug: string,
): Promise<SlugSession> {
	const sessionId = randomUUID();
	const transcriptPath = join(slug, `${sessionId}.jsonl`);
	try {
		const session = await prepareSession(sessionCase, { sessionId, slug });

		return {
			contextEvidence: attemptContextEvidence(request),
			session,
			transcriptPath,
		};
	} catch (error) {
		await removeSessionFiles({
			recordDirectory: request.recordDirectory,
			slug,
			transcriptPath,
		});
		throw error;
	}
}

export { sessionInSlug as default };
