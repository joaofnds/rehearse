import { join } from "node:path";

import type { SessionAttempt } from "./session-attempt";
import { SessionInvocationError } from "./session-confirmation";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRepPlan,
	SessionConfirmationRequest,
} from "./session-confirmation";
import {
	ATTEMPT_DURATION_MINUTES,
	CLOCK_DAY_OF_MONTH,
	CLOCK_HOUR,
	CLOCK_MONTH_INDEX,
	CLOCK_ORIGIN_MINUTE,
	CLOCK_TICK_MINUTES,
	CLOCK_YEAR,
	FIRST_REP_ORDINAL,
	FOURTH_REP_ORDINAL,
	SECOND_REP_ORDINAL,
	THIRD_REP_ORDINAL,
	confirmationRequest,
	metrics,
	recordedAttempt,
	requiredPath,
	simpleSessionCase,
	unavailableTranscriptDiagnostics,
} from "./session-confirmation-test-fixtures";
import {
	emptyCorpus,
	frozenInputWorkspace,
} from "./session-confirmation-workspace-test-fixtures";

class FrozenSessionProvider {
	private readonly inputs: string[] = [];
	private readonly completedReps: number[] = [];
	public constructor(
		private readonly workspace: Awaited<
			ReturnType<typeof frozenInputWorkspace>
		>,
	) {}
	public get observedInputs(): readonly string[] {
		return this.inputs;
	}
	public get completed(): readonly number[] {
		return this.completedReps;
	}
	public readonly run = async (
		plan: SessionConfirmationRepPlan,
	): Promise<SessionAttempt> => {
		const observed = [
			await Bun.file(
				join(requiredPath(plan.sessionCase.fixturePath), "fixture.txt"),
			).text(),
			await Bun.file(requiredPath(plan.sessionCase.transcriptPath)).text(),
			await Bun.file(
				join(plan.corpusSnapshot.root, "output-styles", "brief.md"),
			).text(),
		].join("|");
		this.inputs.push(`${plan.lineage}:${observed}`);
		await this.mutateSource(plan.ordinal);

		const attempt = await recordedAttempt(plan);
		if (plan.ordinal === SECOND_REP_ORDINAL) {
			throw new SessionInvocationError("provider rejected rep 2", {
				...attempt,
				checks: [],
				outcome: "EXECUTION_FAILED",
				reply: undefined,
			});
		}

		this.completedReps.push(plan.ordinal);

		return attempt;
	};
	private async mutateSource(ordinal: number): Promise<void> {
		if (ordinal === FIRST_REP_ORDINAL) {
			await Bun.write(
				join(this.workspace.fixturePath, "fixture.txt"),
				"mutated fixture\n",
			);
			await Bun.write(this.workspace.transcriptPath, "mutated transcript\n");
			await Bun.write(
				join(this.workspace.corpusRoot, "output-styles", "brief.md"),
				"mutated corpus\n",
			);
		}
	}
}
async function frozenSessionScenario(): Promise<{
	readonly dependencies: SessionConfirmationDependencies;
	readonly request: SessionConfirmationRequest;
	readonly provider: FrozenSessionProvider;
}> {
	const workspace = await frozenInputWorkspace();
	const provider = new FrozenSessionProvider(workspace);

	return {
		dependencies: { executeAttempt: provider.run },
		provider,
		request: confirmationRequest({
			corpus: workspace.corpusRoot,
			groupId: "session-group",
			projectedCost: {
				perRepMaximumUsd: 0.2,
				preflightMaximumUsd: 0.1,
				reps: 3,
				totalMaximumUsd: 0.7,
			},
			reps: 3,
			runsDirectory: join(workspace.root, "runs"),
			sessionCase: workspace.sessionCase,
		}),
	};
}
async function outcomeRep(
	plan: SessionConfirmationRepPlan,
): Promise<SessionAttempt> {
	const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
	await Bun.write(transcriptFile, "transcript\n");
	const common = {
		attemptDirectory: join(plan.recordDirectory, "execution"),
		contextManifest: undefined,
		metrics: plan.ordinal === FOURTH_REP_ORDINAL ? undefined : metrics,
		setup: { kind: "isolated" } as const,
		transcriptDiagnostics: unavailableTranscriptDiagnostics,
		transcriptFile,
	};

	return outcomeFrom(common, plan.ordinal);
}
type RecordedAttemptTranscript = Omit<
	SessionAttempt,
	| "checks"
	| "outcome"
	| "reply"
	| "stateEvidenceDirectory"
	| "stateGradingError"
	| "stateResults"
>;

function outcomeFrom(
	common: RecordedAttemptTranscript,
	ordinal: number,
): SessionAttempt {
	if (ordinal === FIRST_REP_ORDINAL) {
		return {
			...common,
			checks: [{ detail: "named pass", kind: "word-band", status: "PASS" }],
			outcome: "SUCCESSFUL",
			reply: "OK",
		};
	}

	if (ordinal === SECOND_REP_ORDINAL) {
		return {
			...common,
			checks: [{ detail: "named failure", kind: "word-band", status: "FAIL" }],
			outcome: "UNSUCCESSFUL",
			reply: "too many words",
		};
	}

	if (ordinal === THIRD_REP_ORDINAL) {
		return {
			...common,
			checks: [],
			outcome: "NO_REPLY",
			reply: undefined,
		};
	}

	if (ordinal === FOURTH_REP_ORDINAL) {
		return {
			...common,
			checks: [
				{ detail: "missing metrics", kind: "word-band", status: "FAIL" },
			],
			outcome: "UNSUCCESSFUL",
			reply: "too many words",
		};
	}

	throw new SessionInvocationError("provider failure", {
		...common,
		checks: [],
		outcome: "EXECUTION_FAILED",
		reply: undefined,
	});
}

interface ConfirmationClock {
	readonly read: () => number;
	readonly execute: (
		plan: SessionConfirmationRepPlan,
	) => Promise<SessionAttempt>;
}

function sessionConfirmationClock(): ConfirmationClock {
	let minutes = 0;
	return {
		execute: async (plan) => {
			minutes += ATTEMPT_DURATION_MINUTES;
			return await recordedAttempt(plan);
		},
		read: () => {
			const reading = Date.UTC(
				CLOCK_YEAR,
				CLOCK_MONTH_INDEX,
				CLOCK_DAY_OF_MONTH,
				CLOCK_HOUR,
				CLOCK_ORIGIN_MINUTE + minutes,
			);
			minutes += CLOCK_TICK_MINUTES;

			return reading;
		},
	};
}

interface SkillMutationProvider {
	readonly observed: readonly string[];
	readonly executeAttempt: SessionConfirmationDependencies["executeAttempt"];
}

function skillMutationProvider(corpusRoot: string): SkillMutationProvider {
	const observed: string[] = [];
	return {
		executeAttempt: async (plan) => {
			observed.push(
				[
					await Bun.file(
						join(plan.corpusSnapshot.root, "skills", "verify", "SKILL.md"),
					).text(),
					await Bun.file(join(plan.corpusSnapshot.root, "CLAUDE.md")).text(),
				].join("|"),
			);
			if (plan.ordinal === FIRST_REP_ORDINAL) {
				await Bun.write(
					join(corpusRoot, "skills", "verify", "SKILL.md"),
					"mutated skill\n",
				);
				await Bun.write(
					join(corpusRoot, "CLAUDE.md"),
					"mutated instructions\n",
				);
			}

			return await recordedAttempt(plan);
		},
		observed,
	};
}

interface SessionConfirmationScenario {
	readonly dependencies: SessionConfirmationDependencies;
	readonly request: SessionConfirmationRequest;
}
async function outcomeSessionScenario(): Promise<SessionConfirmationScenario> {
	const { root, corpusRoot } = await emptyCorpus("rehearse-session-outcomes-");
	return {
		dependencies: { executeAttempt: outcomeRep },
		request: confirmationRequest({
			corpus: corpusRoot,
			groupId: "outcomes-group",
			preflight: { missing: "preflight call metrics", status: "MISSING" },
			projectedCost: {
				perRepMaximumUsd: 0.2,
				preflightMaximumUsd: 0.1,
				reps: 5,
				totalMaximumUsd: 1.1,
			},
			reps: 5,
			runsDirectory: join(root, "runs"),
			sessionCase: simpleSessionCase(),
		}),
	};
}

export {
	frozenSessionScenario,
	outcomeRep,
	sessionConfirmationClock,
	skillMutationProvider,
	outcomeSessionScenario,
};
