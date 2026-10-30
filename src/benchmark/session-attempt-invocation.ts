import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import { CommandError } from "./command";
import { failedInvocation } from "./session-attempt-failure";
import type {
	PreparedAttempt,
	SessionNaming,
} from "./session-attempt-preparation-contract";
import { declaredSettings } from "./session-attempt-setup";
import SessionInvocationError from "./session-invocation-error";
import { carriesMessages, readSessionOutput } from "./session-output";
import type { LoadedSetup } from "./session-output";
import { actualSetupArgs } from "./session-setup";
import type { SessionSetup, SessionSetupRecord } from "./session-setup";

function selectedSettings(
	sessionCase: SessionCase,
	styleName: string | undefined,
): string | undefined {
	const declared = declaredSettings(sessionCase, styleName);

	return declared === undefined ? undefined : JSON.stringify(declared);
}

interface SessionCaseOptions {
	readonly settings: SessionSettings;
	readonly session: SessionNaming;
	readonly styleName?: string | undefined;
	readonly setup: SessionSetup;
}

function isolatedSetupArgs(
	sessionCase: SessionCase,
	styleName: string | undefined,
): string[] {
	const settingsJson = selectedSettings(sessionCase, styleName);

	return [
		"--setting-sources",
		"project",
		"--strict-mcp-config",
		"--tools",
		sessionCase.tools.join(","),
		...(settingsJson === undefined ? [] : ["--settings", settingsJson]),
	];
}

function sessionCaseArgs(
	sessionCase: SessionCase,
	{ settings, session, styleName, setup }: SessionCaseOptions,
): string[] {
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
		"stream-json",
		"--verbose",
		...(setup.kind === "isolated"
			? isolatedSetupArgs(sessionCase, styleName)
			: actualSetupArgs(setup)),
		...(sessionCase.agents === undefined
			? []
			: ["--agents", JSON.stringify(sessionCase.agents)]),
		...(session.resumed
			? ["--system-prompt-snapshot", "off", "--resume", session.sessionId]
			: ["--session-id", session.sessionId]),
	];
}

interface InvokedSession {
	readonly envelope: string;
	readonly setup: SessionSetupRecord;
}

function withLoaded(
	setup: SessionSetupRecord,
	loaded: LoadedSetup | undefined,
): SessionSetupRecord {
	return loaded === undefined ? setup : { ...setup, loaded };
}

interface FailedSession {
	readonly failure: Error;
	readonly loaded: LoadedSetup | undefined;
}

/**
 * A failed command that wrote messages reports only its result line, so its
 * message never carries the transcript the other lines hold. Output that is
 * no message, a diagnostic, stays as it was written.
 */
function failedSession(error: Readonly<Error>): FailedSession {
	if (!(error instanceof CommandError)) {
		return { failure: error, loaded: undefined };
	}

	const { envelope, loaded } = readSessionOutput(error.stdout);
	const failure = carriesMessages(error.stdout)
		? error.withStdout(envelope)
		: error;

	return { failure, loaded };
}

async function runSession({
	request,
	sessionCase,
	settings,
	attemptDirectory,
	startingProjectFiles,
	overlay,
	session,
	transcriptPath,
	contextEvidence,
	setup,
}: PreparedAttempt): Promise<string> {
	try {
		return await request.runClaude(
			sessionCaseArgs(sessionCase, {
				session,
				settings,
				setup: setup.files,
				styleName: overlay.styleName,
			}),
			attemptDirectory,
		);
	} catch (error) {
		const { failure, loaded } = failedSession(
			error instanceof Error ? error : new Error(String(error)),
		);
		const invocation = await failedInvocation(
			request,
			{
				attemptDirectory,
				error: failure,
				setup: withLoaded(setup.record, loaded),
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

/**
 * Output that ends without a result reads as an empty envelope, which
 * recording refuses after it keeps the transcript: the session may have run,
 * and nothing in its output says what it spent.
 */
async function invokeSession(
	execution: PreparedAttempt,
): Promise<InvokedSession> {
	const { envelope, loaded } = readSessionOutput(await runSession(execution));

	return { envelope, setup: withLoaded(execution.setup.record, loaded) };
}

export { sessionCaseArgs, invokeSession };

export type { SessionCaseOptions };
