import { useId } from "react";
import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { NO_RUNS, runsCounted, runsLeftOut } from "#client/latest-version-runs";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import { Button } from "#client/system/ui/button";
import type { CasesResponse } from "./cases-query";

export type ListedCase = CasesResponse["cases"][number];

type PipelineCase = Extract<ListedCase, { kind: "pipeline" }>;

type MeasuredFigures = Extract<ListedCase["figures"], { state: "measured" }>;

/** The smallest group the launch dialog offers. */
const GROUP_ATTEMPTS: LaunchAttempts = 3;

const NO_MODEL_REASON = "Declares no model, so it cannot start";

const KIND_LABEL = {
	pipeline: "task · target repo",
	session: "single session · deterministic checks",
} as const satisfies Record<ListedCase["kind"], string>;

/**
 * A pipeline case's median is the final Judge's verdict. A session case
 * records no letter, so it reads how many runs passed their checks.
 */
function verdicts(listed: ListedCase): string | undefined {
	const { figures } = listed;
	if (figures.state === "no-runs") {
		return undefined;
	}

	if (listed.kind === "session") {
		return figures.judged === 0
			? "no run checked"
			: `${String(figures.passed)} of ${String(figures.judged)} passed their checks`;
	}

	return listed.figures.state === "measured" && listed.figures.median !== null
		? `median ${listed.figures.median} of ${String(figures.judged)} graded`
		: "no run graded";
}

function costPerRun({ costPerRun: cost }: MeasuredFigures): string {
	if (cost.meanUsd === null) {
		return "no cost recorded";
	}

	const mean = `$${cost.meanUsd.toFixed(2)}/run`;

	return cost.lacking === 0
		? mean
		: `${mean}, ${plural(cost.lacking, "run")} without a cost`;
}

function figuresLine(listed: ListedCase): string {
	const { figures } = listed;
	if (figures.state === "no-runs") {
		return NO_RUNS;
	}

	return [
		runsCounted(figures.counted, figures.corpusVersion),
		verdicts(listed),
		costPerRun(figures),
	].join(" · ");
}

function minimumGradeLine({
	latestMinimumGrade,
}: PipelineCase): string | undefined {
	if (latestMinimumGrade === null) {
		return undefined;
	}

	return latestMinimumGrade.state === "recorded"
		? `Minimum grade ${latestMinimumGrade.letter}, as the newest pipeline run set it`
		: "Minimum grade not recorded";
}

function Definition({
	listed,
}: {
	readonly listed: ListedCase;
}): React.JSX.Element {
	if (listed.kind === "session") {
		return (
			<>
				<span className="text-xs tracking-widest text-dim uppercase">
					Checks
				</span>
				<span className="font-mono text-11-5">{listed.checks.join(" · ")}</span>
			</>
		);
	}

	if (listed.pipeline.state === "unavailable") {
		return (
			<>
				<span className="text-xs tracking-widest text-dim uppercase">
					Steps
				</span>
				<span className="text-11-5 text-muted-foreground">
					{listed.pipeline.reason}
				</span>
			</>
		);
	}

	return (
		<>
			<span className="text-xs tracking-widest text-dim uppercase">Steps</span>
			<span className="font-mono text-11-5">
				{listed.pipeline.stages.map(({ name }) => name).join(" → ")}
			</span>
			<span className="text-xs tracking-widest text-dim uppercase">Judges</span>
			<span className="font-mono text-11-5">
				{`${plural(listed.pipeline.stages.length, "step rubric")} + ${listed.finalRubric}`}
			</span>
		</>
	);
}

function RunButtons({
	listed,
}: {
	readonly listed: ListedCase;
}): React.JSX.Element {
	const reasonId = useId();

	if (listed.model === null) {
		return (
			<>
				<span id={reasonId} className="text-11-5 text-dim">
					{NO_MODEL_REASON}
				</span>
				<Button
					variant="quiet"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Run group
				</Button>
				<Button
					variant="quiet"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Run once
				</Button>
			</>
		);
	}

	return (
		<>
			<LaunchDialog
				target={{ kind: "case", caseId: listed.id, attempts: GROUP_ATTEMPTS }}
				trigger={<Button variant="quiet">Run group</Button>}
			/>
			<LaunchDialog
				target={{ kind: "case", caseId: listed.id, attempts: 1 }}
				trigger={<Button variant="outline">Run once</Button>}
			/>
		</>
	);
}

export function CaseCard({
	listed,
}: {
	readonly listed: ListedCase;
}): React.JSX.Element {
	const headingId = useId();
	const minimumGrade =
		listed.kind === "pipeline" ? minimumGradeLine(listed) : undefined;

	return (
		<article
			aria-labelledby={headingId}
			className="rounded-lg border border-divider bg-card px-4 py-3.5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 id={headingId} className="font-mono text-sm">
					{listed.id}
				</h2>
				<span className="rounded-full border border-strong px-2 py-0.5 text-11 text-muted-foreground">
					{KIND_LABEL[listed.kind]}
				</span>
				<span className="text-11-5 text-muted-foreground">
					{listed.target ?? "no repository"}
				</span>
				<span className="ml-auto font-mono text-11 text-dim">
					{figuresLine(listed)}
				</span>
			</div>
			{listed.figures.state === "measured" && listed.figures.leftOut > 0 ? (
				<p className="mt-1 text-right font-mono text-11 text-dim">
					{runsLeftOut(listed.figures.leftOut)}
				</p>
			) : null}
			{minimumGrade === undefined ? null : (
				<p className="mt-1 text-right font-mono text-11 text-dim">
					{minimumGrade}
				</p>
			)}
			<p className="mt-2 max-w-prose text-sm">{listed.title}</p>
			<div className="mt-2.5 flex flex-wrap items-center gap-2.5">
				<Definition listed={listed} />
				<span className="ml-auto flex items-center gap-2">
					<RunButtons listed={listed} />
				</span>
			</div>
		</article>
	);
}
