import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import type { ModelPreflightEvidence } from "#benchmark/model-preflight";
import { operatorStopped } from "#benchmark/operator-stop";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { SessionConfirmationDependencies } from "#benchmark/session-confirmation";
import { recordOutput } from "#cli/cli-test-support";
import type {
	RunCommandDependencies,
	RunCommandRequest,
} from "#cli/run-command";

import {
	passingPreflight,
	passingProbe,
	sessionMetrics,
	smokeCase,
	storedCeiling,
	unavailableTranscriptDiagnostics,
} from "./run-command-test-fixture";

function sessionCommandDependencies(
	overrides: Partial<RunCommandDependencies>,
): RunCommandDependencies {
	return {
		assertPreflight: passingPreflight,
		execute: async () => await Promise.reject(new Error("no pipeline here")),
		executeSession: async () =>
			await Promise.reject(new Error("no session here")),
		output: recordOutput().output,
		probeModel: passingProbe,
		requireCase: async () => await Promise.resolve(smokeCase),
		requireSpendCeiling: storedCeiling,
		...overrides,
	};
}

const recordSuccessfulSessionAttempt: SessionConfirmationDependencies["executeAttempt"] =
	async (plan) => {
		const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
		await Bun.write(transcriptFile, "transcript\n");
		return {
			attemptDirectory: join(plan.recordDirectory, "execution"),
			checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
			contextManifest: undefined,
			metrics: sessionMetrics,
			outcome: "SUCCESSFUL",
			reply: "OK",
			setup: { kind: "isolated" },
			transcriptDiagnostics: unavailableTranscriptDiagnostics,
			transcriptFile,
		};
	};

interface ObservedSessionConfirmation {
	readonly output: RunCommandDependencies["output"];
	readonly events: { readonly record: (event: string) => void };
	readonly executeSession: RunCommandDependencies["executeSession"];
}
class SessionRequestBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<RunCommandRequest>> = {},
		private readonly flags: readonly string[] = [],
	) {}
	public build(): RunCommandRequest {
		return {
			args: [
				"--case",
				"smoke",
				"--model",
				"haiku",
				"--effort",
				"medium",
				"--session-budget-usd",
				"0.2",
				...this.flags,
			],
			json: false,
			stdinIsTerminal: false,
			...this.overrides,
		};
	}
}

function observedConfirmationDependencies({
	output,
	events,
	executeSession,
}: ObservedSessionConfirmation): RunCommandDependencies {
	return sessionCommandDependencies({
		executeSession,
		output: {
			stderr: (text) => {
				events.record(`output:${text.trim()}`);
				output.stderr(text);
			},
			stdout: output.stdout,
		},
		probeModel: async () => {
			events.record("probe");
			return await Promise.resolve<ModelPreflightEvidence>({
				call: { metrics: sessionMetrics },
				status: "COMPLETE",
			});
		},
	});
}

interface SessionConfirmationState {
	readonly hasSummary: boolean;
	readonly operatorStopped: boolean;
}
async function sessionConfirmationState(
	runsDirectory: string,
): Promise<SessionConfirmationState> {
	const [groupId = "missing"] = await readdir(
		join(runsDirectory, "confirmations"),
	);
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	return {
		hasSummary: await Bun.file(paths.groupFile).exists(),
		operatorStopped: await operatorStopped(paths),
	};
}

export {
	observedConfirmationDependencies,
	recordSuccessfulSessionAttempt,
	sessionCommandDependencies,
	sessionConfirmationState,
	SessionRequestBuilder,
};
