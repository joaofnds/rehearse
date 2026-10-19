import { z } from "zod";

import { recordedStageEvidenceSchema } from "#benchmark/contracts";
import type { LocalCheckResult } from "#benchmark/contracts";
import type { Span } from "#benchmark/evidence-locator";
import type RecordedSources from "#server/evidence-recorded-sources";

/**
 * Opens the source a judge's evidence item cites, as the run's records hold
 * it. A request names a run record, a judge and an evidence item, never a
 * path: the run id is parsed as a record id, the stage is matched against the
 * stage records the run wrote, and every text returned comes from the record,
 * so no string a judge wrote reaches the filesystem.
 */

type EvidenceJudge =
	| { readonly kind: "stage"; readonly stage: string }
	| { readonly kind: "final" };

interface EvidenceRequest {
	readonly runsDirectory: string;
	readonly run: string;
	readonly judge: EvidenceJudge;
	readonly section: string;
	readonly item: string;
	readonly index: string;
}

type SourceView =
	| {
			readonly kind: "text";
			readonly label: string;
			readonly text: string;
			readonly span?: Span;
	  }
	| {
			readonly kind: "harness";
			readonly result: "checkIntegrity" | "localChecks";
			readonly recorded: boolean;
			readonly value?: LocalCheckResult;
	  }
	| {
			readonly kind: "harness";
			readonly result: "harnessFailure";
			readonly recorded: boolean;
			readonly value?: string;
	  }
	| { readonly kind: "absent" }
	| { readonly kind: "before-quoted-spans" };

interface EvidenceSource {
	/** The record file, relative to the repository. */
	readonly record: string;
	readonly source: string;
	readonly path: string;
	readonly claim: string;
	readonly quote?: string;
	readonly view: SourceView;
}

interface JudgedItems {
	readonly sections: Readonly<Record<string, readonly JudgedItem[]>>;
	readonly sources: RecordedSources;
}

type JudgedItem = z.infer<typeof judgedItemSchema>;

const judgedItemSchema = z.looseObject({
	evidence: z.array(recordedStageEvidenceSchema),
	id: z.string(),
});

class EvidenceSourceError extends Error {
	public override name = "EvidenceSourceError";

	public constructor(
		public readonly kind: "not-found" | "refused",
		message: string,
	) {
		super(message);
	}
}

function notFound(message: string): EvidenceSourceError {
	return new EvidenceSourceError("not-found", message);
}

export { judgedItemSchema, EvidenceSourceError, notFound };
export type {
	EvidenceJudge,
	EvidenceRequest,
	SourceView,
	EvidenceSource,
	JudgedItems,
};
