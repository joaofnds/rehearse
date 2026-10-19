import { useQuery } from "@tanstack/react-query";

import type { MonitoredStage } from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";

import type { CaseListing, SettledTarget } from "./launch-target-contract";

interface CaseConditionsProps {
	readonly listed: CaseListing | undefined;
}

function CaseConditions({ listed }: CaseConditionsProps): React.JSX.Element {
	if (listed === undefined) {
		return (
			<p className="text-14 text-muted-foreground">
				Choose a readable case to inspect its launch conditions.
			</p>
		);
	}
	return (
		<section
			aria-label="Launch conditions"
			className="rounded-md border bg-muted px-3 py-2.5"
		>
			<h3 className="text-14 font-medium">{listed.title}</h3>
			<dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
				<dt className="text-muted-foreground">Workflow model</dt>
				<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
					{listed.model ?? "No model declared"}
				</dd>
				<dt className="text-muted-foreground">Input</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
					{listed.kind === "session"
						? "Declared session prompt, fixture and transcript prefix, when provided."
						: "Declared task and product brief; the pipeline runs against its target repository."}
				</dd>
				{listed.kind === "pipeline" ? (
					<>
						<dt className="text-muted-foreground">Target</dt>
						<dd className="sm:col-span-3 font-mono wrap-anywhere min-w-0">
							{listed.target ?? "Target details unavailable"}
						</dd>
					</>
				) : null}
			</dl>
			<p className="mt-2 text-12 text-secondary-foreground">
				{listed.kind === "pipeline"
					? "Effort and Judge settings are resolved by the launcher; their effective values are not exposed by this API."
					: "Effort is resolved by the launcher; its effective value is not exposed by this API. This session is evaluated by its declared checks."}
			</p>
		</section>
	);
}

interface ReplayConditionsProps {
	readonly target: Extract<SettledTarget, { kind: "replay" }>;
}

function ReplayConditions({
	target,
}: ReplayConditionsProps): React.JSX.Element {
	const source = useQuery(runRecordQuery(target.run));
	const pending = source.isPending ? "Reading source record…" : undefined;
	const step = source.data?.stages.find(({ stage }) => stage === target.stage);
	const input = replayFrozenInput(target, step);
	return (
		<section
			aria-label="Launch conditions"
			className="rounded-md border bg-muted px-3 py-2.5"
		>
			<h3 className="text-14 font-medium">Frozen input · current corpus</h3>
			<dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
				<dt className="text-muted-foreground">Case</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
					{source.data?.caseId ?? pending ?? "Source case unavailable"}
				</dd>
				<dt className="text-muted-foreground">Workflow model</dt>
				<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
					{source.data?.identity.model ??
						pending ??
						"Source run's model; value unavailable"}
				</dd>
				<dt className="text-muted-foreground">Frozen input</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">{input}</dd>
			</dl>
			<p className="mt-2 text-12 text-secondary-foreground">
				Recorded source effort:{" "}
				{source.data?.identity.effort ?? pending ?? "not recorded"}. Replay
				effort and Judge settings are resolved at launch; they are not
				guaranteed to match the source.
			</p>
			{source.isError ? (
				<p className="mt-1 text-12 text-secondary-foreground">
					Source details could not be read. The launcher validates the saved
					checkpoint before starting.
				</p>
			) : null}
		</section>
	);
}

interface LaunchConditionsProps {
	readonly target: SettledTarget;
	readonly cases: readonly CaseListing[];
	readonly caseId: string | undefined;
}

function LaunchConditions({
	target,
	cases,
	caseId,
}: LaunchConditionsProps): React.JSX.Element {
	switch (target.kind) {
		case "case": {
			return <CaseConditions listed={cases.find(({ id }) => id === caseId)} />;
		}
		case "replay": {
			return <ReplayConditions target={target} />;
		}
		case "comparison":
		case "extension": {
			return (
				<section
					aria-label="Launch conditions"
					className="rounded-md border bg-muted px-3 py-2.5 text-14 text-secondary-foreground"
				>
					Each new group uses its saved arm’s checkpoint, corpus, workflow
					model, effort and Judge settings. Their values are not exposed by this
					launch API. The stored spending ceiling still applies.
				</section>
			);
		}
		default: {
			return target satisfies never;
		}
	}
}

function replayFrozenInput(
	target: ReplayConditionsProps["target"],
	step: MonitoredStage | undefined,
): string {
	const checkpoint = step?.artifactsIn.entries.find(
		(entry) => entry.from === "upstream checkpoint",
	);
	let input = `The saved checkpoint ${target.stage} starts from; earlier stages are not run again.`;
	if (checkpoint?.from === "upstream checkpoint") {
		input = `${checkpoint.upstream} checkpoint`;
		if (checkpoint.checkpointShortId.state === "available") {
			input += ` · ${checkpoint.checkpointShortId.shortId}`;
		}
	}
	return input;
}

export { LaunchConditions as default };
