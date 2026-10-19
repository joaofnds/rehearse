import type { InferResponseType } from "hono/client";

import type { LaunchAttempts } from "#benchmark/launch-attempts";
import type { launchClient } from "#client/api-client";

/** A pipeline run the operator can replay a step of. */
interface ReplayableRun {
	readonly run: string;
	readonly caseId: string | undefined;
	/** Its steps whose starting checkpoint is recorded, in pipeline order. */
	readonly stages: readonly string[];
	/** The step chosen when this run is chosen. */
	readonly openingStage: string;
}

interface ReplayChoice {
	readonly run: string;
	readonly stage: string;
}

type LaunchTarget =
	| {
			readonly kind: "case";
			/** The case the dialog opens on, else the first that declares a model. */
			readonly caseId?: string;
			/** The attempts the dialog opens on, else one. */
			readonly attempts?: LaunchAttempts;
	  }
	| {
			readonly kind: "replay";
			readonly run: string;
			readonly stage: string;
			/** The attempts the dialog opens on, else one. */
			readonly attempts?: LaunchAttempts;
	  }
	| {
			/** A stage replay whose run and step the operator chooses in the dialog. */
			readonly kind: "chosen-replay";
			/** Newest first. */
			readonly runs: readonly ReplayableRun[];
			readonly opensOn: ReplayChoice;
	  }
	| {
			readonly kind: "comparison";
			readonly armA: string;
			readonly armB: string;
			readonly run: string;
			readonly stage: string;
			/** Baseline group size, which the control group copies. */
			readonly reps: number;
	  }
	| {
			readonly kind: "extension";
			readonly comparison: string;
			/** How many attempts each arm gains. */
			readonly attempts: number;
			/** What they cost at each arm's mean recorded cost per attempt. */
			readonly usd: number;
	  };

/** A launch target with its run and step settled. */
type SettledTarget = Exclude<LaunchTarget, { readonly kind: "chosen-replay" }>;

type CasesResponse = InferResponseType<typeof launchClient.api.cases.$get>;

type CaseListing = CasesResponse["cases"][number];

export type {
	CaseListing,
	CasesResponse,
	LaunchTarget,
	ReplayableRun,
	ReplayChoice,
	SettledTarget,
};
