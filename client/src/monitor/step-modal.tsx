import { useId } from "react";
import {
	notRecorded,
	ReadState,
	skillReading,
	stageCostReading,
	wallTimeReading,
} from "#client/run-detail/step-report";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import { endedStatus, hasEnded } from "./run-record-query";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";

/** The name the server gives the checkpoint a run's first stage starts from. */
const INITIAL_CHECKPOINT = "initial";

/**
 * What the header says of the stage: its skill, wall time and cost as its
 * record keeps them, or pending while the stage has not ended.
 */
function figuresReading(stage: MonitoredStage): string {
	if (!hasEnded(stage)) {
		return "skill pending · wall time pending · cost pending";
	}

	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
	].join(" · ");
}

function verdictReading(stage: MonitoredStage): string {
	return hasEnded(stage)
		? STATUS_VOCABULARY[endedStatus(stage)].word
		: STATUS_VOCABULARY.pending.word;
}

function ModalHeader({
	stage,
	number,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	return (
		<header className="flex flex-none flex-wrap items-center gap-3 border-b border-strong px-4 py-3">
			<span className="font-mono text-10 tracking-label text-dim uppercase">
				Step {String(number).padStart(2, "0")}
			</span>
			<DialogTitle>{stage.stage}</DialogTitle>
			<span className="font-mono text-11 text-muted-foreground">
				{figuresReading(stage)}
			</span>
			<span className="ml-auto flex items-center gap-2.25">
				<span className="text-11-5 text-secondary-foreground">
					verdict {verdictReading(stage)}
				</span>{" "}
				<Grade
					size="node"
					value={
						stage.grade.state === "available"
							? { letter: stage.grade.letter }
							: { pending: true }
					}
				/>
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

type ArtifactIn = MonitoredStage["artifactsIn"]["entries"][number];

const HASH_SHOWN = 6;

function stepName(record: RunRecordResponse, stage: string): string {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return `step ${String(index + 1).padStart(2, "0")}`;
}

function SectionTitle({
	id,
	children,
}: {
	readonly id?: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<h3
			id={id}
			className="mt-3.5 text-10 tracking-label text-dim uppercase first:mt-0"
		>
			{children}
		</h3>
	);
}

function InstructionsLoaded({
	stage,
	labelledBy,
}: {
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}): React.JSX.Element {
	const { readManifest } = stage;
	if (readManifest.state === "unavailable") {
		return (
			<p className="mt-2 text-12 text-muted-foreground">
				{hasEnded(stage)
					? notRecorded("Instructions", readManifest.reasons)
					: "Instructions pending: the step has not ended"}
			</p>
		);
	}

	return (
		<ul
			aria-labelledby={labelledBy}
			className="mt-2 overflow-hidden rounded-card border border-border"
		>
			{readManifest.entries.map((entry) => (
				<li
					key={`${entry.half}:${entry.path}`}
					className="border-b border-subtle px-2.5 py-1.75 last:border-b-0"
				>
					<span className="flex items-center gap-2.25">
						<span className="flex-1 font-mono text-11-5">{entry.path}</span>
						<span className="font-mono text-10-5 text-dim">
							{entry.sha256 === undefined
								? "no hash"
								: `sha ${entry.sha256.slice(0, HASH_SHOWN)}`}
						</span>
					</span>
					<span className="mt-0.5 flex items-center gap-2 text-10-5">
						<span className="text-dim">{entry.role}</span>
						<span className="flex items-center gap-1.25 text-muted-foreground">
							<ReadState entry={entry} />
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

type UpstreamCheckpoint = Extract<
	ArtifactIn,
	{ readonly from: "upstream checkpoint" }
>;

/** The checkpoint by its short id, or by whose it is when it has none. */
function checkpointName({
	checkpointShortId,
	upstream,
}: UpstreamCheckpoint): string {
	if (checkpointShortId.state === "available") {
		return checkpointShortId.shortId;
	}

	return upstream === INITIAL_CHECKPOINT
		? "the initial checkpoint"
		: `${upstream}'s checkpoint`;
}

/** An artifact in as the modal names it, and where it came from. */
interface ArtifactInRow {
	readonly name: string;
	readonly from: string;
}

function artifactInReading(
	record: RunRecordResponse,
	artifact: ArtifactIn,
): ArtifactInRow {
	if (artifact.from === "task declaration") {
		return { name: artifact.taskId, from: "task declaration" };
	}
	if (artifact.from === "upstream checkpoint") {
		const initial = artifact.upstream === INITIAL_CHECKPOINT;

		return {
			name: `${artifact.target} at ${checkpointName(artifact)}`,
			from: initial
				? "initial checkpoint"
				: `${stepName(record, artifact.upstream)} checkpoint`,
		};
	}

	return {
		name: artifact.path,
		from: `${stepName(record, artifact.stage)} · ${artifact.stage} · ${artifact.change}`,
	};
}

function ArtifactsIn({
	record,
	stage,
	labelledBy,
}: {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}): React.JSX.Element {
	const { entries, missing } = stage.artifactsIn;

	return (
		<>
			<ul aria-labelledby={labelledBy} className="mt-2 flex flex-col gap-1">
				{entries.map((artifact) => {
					const { name, from } = artifactInReading(record, artifact);

					return (
						<li
							key={`${name}:${from}`}
							className="flex items-center gap-2.25 rounded-md border border-border px-2.5 py-1.5"
						>
							<span aria-hidden="true" className="text-dim">
								↓
							</span>
							<span className="flex-1 font-mono text-11-5 break-all">
								{name}
							</span>
							<span className="text-10-5 text-dim">{from}</span>
						</li>
					);
				})}
			</ul>
			{missing.map(({ part, reason }) => (
				<p key={part} className="mt-1.5 text-11 text-dim">
					Not read: the workflow-state changes of {stepName(record, part)} ·{" "}
					{part}, as {reason}
				</p>
			))}
		</>
	);
}

/** What went into the stage: the instructions it loaded and what it started from. */
function WhatWentIn({
	record,
	stage,
}: {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	const instructionsId = useId();
	const artifactsInId = useId();

	return (
		<section aria-label="What went in">
			<SectionTitle id={instructionsId}>
				Instructions this step loaded
			</SectionTitle>
			<InstructionsLoaded stage={stage} labelledBy={instructionsId} />
			<SectionTitle id={artifactsInId}>Artifacts in</SectionTitle>
			<ArtifactsIn record={record} stage={stage} labelledBy={artifactsInId} />
		</section>
	);
}

/**
 * A task-graph node's `in / out` action and the step modal it opens (SPEC.md
 * 2c and 3): what went into the stage, what came out, its judge, and the
 * operations on it.
 */
export function StepModalAction({
	record,
	stage,
	number,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="quiet"
					size="xs"
					aria-label={`${stage.stage} — instructions in, artifacts out`}
				>
					in / out ▸
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<ModalHeader stage={stage} number={number} />
				<div className="grid flex-1 grid-cols-2 gap-4.5 overflow-y-auto px-4 py-3.5">
					<WhatWentIn record={record} stage={stage} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
