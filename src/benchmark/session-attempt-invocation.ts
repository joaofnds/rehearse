import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import { failedInvocation } from "./session-attempt-failure";
import type {
	PreparedAttempt,
	SessionNaming,
} from "./session-attempt-preparation-contract";
import { declaredSettings } from "./session-attempt-setup";
import SessionInvocationError from "./session-invocation-error";
import type { ActualSetupFiles, SessionSetup } from "./session-setup";

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

function actualSetupArgs(setup: ActualSetupFiles): string[] {
	return [
		"--setting-sources",
		"project,local",
		"--settings",
		setup.settingsFile,
		...setup.mcpConfigFiles.flatMap((file) => ["--mcp-config", file]),
		...setup.pluginDirectories.flatMap((directory) => [
			"--plugin-dir",
			directory,
		]),
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
		"json",
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
		const failure = error instanceof Error ? error : new Error(String(error));
		const invocation = await failedInvocation(
			request,
			{
				attemptDirectory,
				error: failure,
				setup: setup.record,
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
