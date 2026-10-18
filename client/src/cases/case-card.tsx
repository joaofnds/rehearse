import { Link } from "@tanstack/react-router";
import { useId } from "react";
import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { NO_RUNS, runsCounted, runsLeftOut } from "#client/latest-version-runs";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import { Button } from "#client/system/ui/button";
import { StateBadge } from "#client/system/components/state-badge";
import type { CasesResponse } from "./cases-query";

export type ListedCase = CasesResponse["cases"][number];

type PipelineCase = Extract<ListedCase, { kind: "pipeline" }>;

type MeasuredFigures = Extract<ListedCase["figures"], { state: "measured" }>;

/** The smallest group the launch dialog offers. */
const GROUP_ATTEMPTS: LaunchAttempts = 3;

const NO_MODEL_REASON = "Declares no model, so it cannot start";

const KIND_LABEL = {
	pipeline: "Workflow case",
	session: "Session case",
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
				<span className="text-12 tracking-widest text-dim uppercase">
					Checks
				</span>
				<span className="font-mono text-12">{listed.checks.join(" · ")}</span>
			</>
		);
	}

	if (listed.pipeline.state === "unavailable") {
		return (
			<>
				<span className="text-12 tracking-widest text-dim uppercase">
					Steps
				</span>
				<span className="text-12 text-muted-foreground">
					{listed.pipeline.reason}
				</span>
			</>
		);
	}

	return (
		<>
			<span className="text-12 tracking-widest text-dim uppercase">Steps</span>
			<span className="font-mono text-12">
				{listed.pipeline.stages.map(({ name }) => name).join(" → ")}
			</span>
			<span className="text-12 tracking-widest text-dim uppercase">Judges</span>
			<span className="font-mono text-12">
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
				<span id={reasonId} className="text-12 text-dim">
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
	showFigures = true,
}: {
	readonly listed: ListedCase;
	readonly showFigures?: boolean;
}): React.JSX.Element {
	const headingId = useId();
	const minimumGrade =
		listed.kind === "pipeline" ? minimumGradeLine(listed) : undefined;

	return (
		<article
			aria-labelledby={headingId}
			className="rounded-lg border border-divider bg-card p-6"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<h2
					id={headingId}
					className="min-w-0 max-w-full text-16 font-semibold wrap-anywhere"
				>
					<Link
						to="/cases"
						search={{ caseId: listed.id }}
						className="text-link hover:underline"
					>
						{listed.id}
					</Link>
				</h2>
				<StateBadge tone="neutral">{KIND_LABEL[listed.kind]}</StateBadge>
				<span className="text-12 text-muted-foreground">
					{listed.target ?? "no repository"}
				</span>
				{showFigures ? (
					<span className="w-full text-12 leading-reading wrap-anywhere text-dim">
						{listed.figures.state === "measured" ? (
							<Link
								to={`/cases?caseId=${encodeURIComponent(listed.id)}&corpusVersion=${encodeURIComponent(listed.figures.corpusVersion ?? "unrecorded")}#case-evidence`}
								className="text-link hover:underline"
							>
								{figuresLine(listed)}
							</Link>
						) : (
							figuresLine(listed)
						)}
					</span>
				) : null}
			</div>
			{showFigures &&
			listed.figures.state === "measured" &&
			listed.figures.leftOut > 0 ? (
				<p className="mt-1 text-12 text-dim">
					{runsLeftOut(listed.figures.leftOut)}
				</p>
			) : null}
			{!showFigures || minimumGrade === undefined ? null : (
				<p className="mt-1 text-12 text-dim">{minimumGrade}</p>
			)}
			<p className="mt-3 max-w-prose text-14 leading-reading wrap-anywhere">
				{listed.title}
			</p>
			<div className="mt-5 flex flex-wrap items-center gap-3 border-t border-subtle pt-4">
				<Definition listed={listed} />
				<span className="ml-auto flex flex-wrap items-center gap-2">
					{listed.kind === "pipeline" ? (
						<Button asChild variant="quiet">
							<Link
								to="/cases"
								search={{ view: "workflows", caseId: listed.id }}
							>
								View workflow
							</Link>
						</Button>
					) : null}
					<RunButtons listed={listed} />
				</span>
			</div>
		</article>
	);
}
