import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import { failedInvocation } from "./session-attempt-failure";
import type {
	PreparedAttempt,
	SessionNaming,
} from "./session-attempt-preparation-contract";
import SessionInvocationError from "./session-invocation-error";

function selectedSettings(
	sessionCase: SessionCase,
	styleName: string | undefined,
): string | undefined {
	if (styleName === undefined) {
		return sessionCase.settings === undefined
			? undefined
			: JSON.stringify(sessionCase.settings);
	}

	return JSON.stringify({ ...sessionCase.settings, outputStyle: styleName });
}

interface SessionCaseOptions {
	readonly settings: SessionSettings;
	readonly session: SessionNaming;
	readonly styleName?: string | undefined;
}

function sessionCaseArgs(
	sessionCase: SessionCase,
	{ settings, session, styleName }: SessionCaseOptions,
): string[] {
	const declaredSettings = selectedSettings(sessionCase, styleName);

	return [
		"claude",
		"-p",
		sessionCase.prompt,
		"--model",
		settings.model,
		...(settings.effort === undefined ? [] : ["--effort", settings.effort]),
		"--max-budget-usd",
		String(settings.budgetUsd),
		"--output-format",
		"json",
		"--setting-sources",
		"project",
		"--strict-mcp-config",
		"--tools",
		sessionCase.tools.join(","),
		...(declaredSettings === undefined ? [] : ["--settings", declaredSettings]),
		...(sessionCase.agents === undefined
			? []
			: ["--agents", JSON.stringify(sessionCase.agents)]),
		...(session.resumed
			? ["--system-prompt-snapshot", "off", "--resume", session.sessionId]
			: ["--session-id", session.sessionId]),
	];
}

async function invokeSession({
	request,
	sessionCase,
	settings,
	attemptDirectory,
	startingProjectFiles,
	overlay,
	session,
	transcriptPath,
	contextEvidence,
}: PreparedAttempt): Promise<string> {
	try {
		return await request.runClaude(
			sessionCaseArgs(sessionCase, {
				session,
				settings,
				styleName: overlay.styleName,
			}),
			attemptDirectory,
		);
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		const invocation = await failedInvocation(
			request,
			{
				attemptDirectory,
				error: failure,
				writtenTranscript: transcriptPath,
			},
			contextEvidence,
		);

		throw new SessionInvocationError(invocation.message, {
			...invocation.attempt,
			startingProjectFiles,
		});
	}
}

export { sessionCaseArgs, invokeSession };

export type { SessionCaseOptions };
