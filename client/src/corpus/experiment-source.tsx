import { Link } from "@tanstack/react-router";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { Button } from "#client/system/ui/button";

import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source-evidence";

interface ExperimentSourceProps {
	readonly source: CorpusExperimentSource;
	readonly path: string;
	readonly evidence: SourceEvidence | undefined;
	readonly currentCorpus: string | undefined;
	readonly operation: "reading" | "editing";
	readonly onClear: () => void;
}

function ExperimentSource({
	source,
	path,
	evidence,
	currentCorpus,
	operation,
	onClear,
}: ExperimentSourceProps): React.JSX.Element {
	return (
		<section
			aria-label="Instruction test source"
			className="rounded-lg border border-strong bg-raised px-4 py-3 text-14"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<SourceProvenance
					source={source}
					path={path}
					evidence={evidence}
					currentCorpus={currentCorpus}
					operation={operation}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/runs/$run"
						params={{ run: source.run }}
						search={{ step: source.stage, view: "results" }}
						className="text-link underline underline-offset-2"
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

interface SourceProvenanceProps {
	readonly source: CorpusExperimentSource;
	readonly path: string;
	readonly evidence: SourceEvidence | undefined;
	readonly currentCorpus: string | undefined;
	readonly operation: "reading" | "editing";
}

function SourceProvenance({
	source,
	path,
	evidence,
	currentCorpus,
	operation,
}: SourceProvenanceProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-medium">Testing an instruction from a saved step</p>
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
				<p role="alert" className="text-attention">
					{evidence.reason}
				</p>
			)}
		</div>
	);
}

export { default as sourceEvidence } from "./experiment-source-evidence";
export type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source-evidence";
export { default as useExperimentSource } from "./use-experiment-source";
export type { ExperimentSourceState } from "./use-experiment-source";
export { ExperimentSource };
