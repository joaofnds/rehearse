import { Link } from "@tanstack/react-router";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	runRecordQuery,
	stageReplayRefusal,
} from "#client/monitor/run-record-query";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { Button } from "#client/system/ui/button";

/** The saved step whose instruction prompted this edit. */
export interface CorpusExperimentSource {
	readonly run: string;
	readonly stage: string;
}

export type SourceEvidence = {
	readonly corpus: string;
	readonly checkpoint: string;
} & (
	| { readonly replayable: true; readonly reason?: never }
	| { readonly replayable: false; readonly reason: string }
);

export interface ExperimentSourceState {
	readonly activeSource: CorpusExperimentSource | undefined;
	readonly sourcePath: string | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly visibleEvidence: SourceEvidence | undefined;
	readonly clearSource: () => void;
	readonly selectedFile: (path: string) => void;
}

function sourceCorpus(stage: RunRecordResponse["stages"][number]): string {
	if (stage.corpusVersion?.kind === "version") {
		return corpusVersionLabel(stage.corpusVersion.digest);
	}
	if (stage.corpusVersion?.kind === "refused") {
		return `measurement refused: ${stage.corpusVersion.refusal}`;
	}
	return "not recorded";
}

/** Reads provenance from the record, including the checkpoint the step consumed. */
export function sourceEvidence(
	record: RunRecordResponse,
	source: CorpusExperimentSource,
	path: string,
): SourceEvidence {
	const index = record.stages.findIndex(({ stage }) => stage === source.stage);
	const stage = record.stages[index];
	if (stage === undefined) {
		return {
			corpus: "not recorded",
			checkpoint: "not recorded",
			replayable: false,
			reason: "This step is not in the saved run record.",
		};
	}

	const corpus = sourceCorpus(stage);
	const predecessor = record.stages[index - 1];
	const upstream = stage.artifactsIn.entries.find(
		(entry) => entry.from === "upstream checkpoint",
	);
	const checkpointId =
		upstream?.from === "upstream checkpoint" &&
		upstream.checkpointShortId.state === "available"
			? upstream.checkpointShortId.shortId
			: undefined;
	const checkpoint =
		predecessor === undefined
			? `initial checkpoint${checkpointId === undefined ? "" : ` · ${checkpointId}`}`
			: `${predecessor.stage} checkpoint${checkpointId === undefined ? "" : ` · ${checkpointId}`}`;
	const refusal = stageReplayRefusal(record, source.stage);
	if (refusal !== undefined) {
		return {
			corpus,
			checkpoint,
			replayable: false,
			reason: refusal,
		};
	}
	const readFile =
		stage.readManifest.state === "available" &&
		stage.readManifest.entries.some(
			(entry) => entry.half === "corpus" && entry.path === path,
		);
	if (!readFile) {
		return {
			corpus,
			checkpoint,
			replayable: false,
			reason: `${path} is not recorded as read from the corpus by this step.`,
		};
	}
	return { corpus, checkpoint, replayable: true };
}

/** Ties a saved source to the file that opened it; switching files clears it. */
export function useExperimentSource(
	openedPath: string | undefined,
	source: CorpusExperimentSource | undefined,
	editPath: string | undefined,
): ExperimentSourceState {
	const [bound, setBound] = useState<
		| { readonly path: string; readonly source: CorpusExperimentSource }
		| undefined
	>(
		source === undefined || openedPath === undefined
			? undefined
			: { path: openedPath, source },
	);
	useEffect(() => {
		setBound(
			source === undefined || openedPath === undefined
				? undefined
				: { path: openedPath, source },
		);
	}, [openedPath, source?.run, source?.stage]);
	const activeSource =
		bound !== undefined && (editPath === undefined || editPath === bound.path)
			? bound.source
			: undefined;
	const record = useQuery({
		...runRecordQuery(activeSource?.run ?? ""),
		enabled: activeSource !== undefined,
	});
	const evidence =
		activeSource !== undefined && record.isSuccess && bound !== undefined
			? sourceEvidence(record.data, activeSource, bound.path)
			: undefined;
	const visibleEvidence: SourceEvidence | undefined = record.isError
		? {
				corpus: "not recorded",
				checkpoint: "not recorded",
				replayable: false,
				reason: `Could not read the saved run: ${record.error.message}`,
			}
		: evidence;

	return {
		activeSource,
		sourcePath: bound?.path,
		evidence,
		visibleEvidence,
		clearSource: () => {
			setBound(undefined);
		},
		selectedFile: (path) => {
			if (path !== bound?.path) {
				setBound(undefined);
			}
		},
	};
}

export function ExperimentSource({
	source,
	path,
	evidence,
	currentCorpus,
	operation,
	onClear,
}: {
	readonly source: CorpusExperimentSource;
	readonly path: string;
	readonly evidence: SourceEvidence | undefined;
	readonly currentCorpus: string | undefined;
	readonly operation: "reading" | "editing";
	readonly onClear: () => void;
}): React.JSX.Element {
	return (
		<section
			aria-label="Instruction test source"
			className="rounded-lg border border-strong bg-raised px-4 py-3 text-sm"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1.5">
					<p className="font-medium">
						Testing an instruction from a saved step
					</p>
					<p>
						<span className="font-mono">{source.run}</span>
						{" / "}
						<span className="font-mono">{source.stage}</span>
						{" · "}
						<span className="font-mono">{path}</span>
					</p>
					<p className="text-muted-foreground">
						{"Saved source corpus: "}
						<span className="font-mono">{evidence?.corpus ?? "loading…"}</span>
						{" · starting "}
						{evidence?.checkpoint ?? "checkpoint loading…"}
					</p>
					<p className="text-muted-foreground">
						{operation === "editing"
							? "Editing current linked "
							: "Reading current linked "}
						<span className="font-mono">
							{currentCorpus === undefined
								? "corpus version unavailable"
								: corpusVersionLabel(currentCorpus)}
						</span>
						{operation === "editing"
							? "; the draft starts from its current file, not the frozen source text."
							: "; this viewer shows its current file. The saved source remains available in the run."}
					</p>
					{evidence?.reason === undefined ? null : (
						<p role="alert" className="text-secondary-foreground">
							{evidence.reason}
						</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/runs/$run"
						params={{ run: source.run }}
						search={{ view: "results", step: source.stage }}
						className="text-primary underline underline-offset-2"
					>
						Return to source results
					</Link>
					<Button size="sm" variant="outline" onClick={onClear}>
						Clear source
					</Button>
				</div>
			</div>
		</section>
	);
}
