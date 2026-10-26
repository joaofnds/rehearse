import { useId } from "react";

import {
	HASH_SHOWN,
	ReadState,
	notRecorded,
} from "#client/run-detail/step-report";
import withinCase from "#client/within-case";

import type {
	ConsumedCheckpoint,
	MonitoredStage,
	RunRecordResponse,
} from "./run-record-query";
import { INITIAL_CHECKPOINT, hasEnded } from "./run-record-query";
import { stepName } from "./step-record-readings";

const PREFIX_START_INDEX = 0;

type ArtifactIn = MonitoredStage["artifactsIn"]["entries"][number];

interface SectionTitleProps {
	readonly id?: string;
	readonly children: React.ReactNode;
}

function SectionTitle({ id, children }: SectionTitleProps): React.JSX.Element {
	return (
		<h3
			id={id}
			className="mt-3.5 text-12 tracking-label text-dim uppercase first:mt-0"
		>
			{children}
		</h3>
	);
}

interface InstructionsLoadedProps {
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}

function InstructionsLoaded({
	stage,
	labelledBy,
}: InstructionsLoadedProps): React.JSX.Element {
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
					<span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2.25">
						<span className="min-w-0 flex-1 font-mono text-12 wrap-anywhere">
							{entry.path}
						</span>
						<span className="font-mono text-12 text-dim">
							{entry.sha256 === undefined
								? "no hash"
								: `sha ${entry.sha256.slice(PREFIX_START_INDEX, HASH_SHOWN)}`}
						</span>
					</span>
					<span className="mt-0.5 flex flex-wrap items-center gap-2 text-12">
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

/**
 * The checkpoint by its short id within the run's case, or by whose it is
 * when it has none.
 */
function checkpointName(
	{ checkpointShortId, upstream }: ConsumedCheckpoint,
	caseId: string,
): string {
	if (checkpointShortId.state === "available") {
		return withinCase(checkpointShortId.shortId, caseId);
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
		return { from: "task declaration", name: artifact.taskId };
	}
	if (artifact.from === "upstream checkpoint") {
		const initial = artifact.upstream === INITIAL_CHECKPOINT;

		return {
			from: initial
				? "initial checkpoint"
				: `${stepName(record, artifact.upstream)} checkpoint`,
			name: `${artifact.target} at ${checkpointName(artifact, record.caseId)}`,
		};
	}

	return {
		from: `${stepName(record, artifact.stage)} · ${artifact.stage} · ${artifact.change}`,
		name: artifact.path,
	};
}

interface ArtifactsInProps {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly labelledBy: string;
}

function ArtifactsIn({
	record,
	stage,
	labelledBy,
}: ArtifactsInProps): React.JSX.Element {
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
							<span className="flex-1 font-mono text-12 wrap-anywhere">
								{name}
							</span>
							<span className="text-12 text-dim">{from}</span>
						</li>
					);
				})}
			</ul>
			{missing.map(({ part, reason }) => (
				<p key={part} className="mt-1.5 text-12 text-dim">
					Not read: the workflow-state changes of {stepName(record, part)} ·{" "}
					{part}, as {reason}
				</p>
			))}
		</>
	);
}

/** What went into the stage: the instructions it loaded and what it started from. */
interface WhatWentInProps {
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
}

function WhatWentIn({ record, stage }: WhatWentInProps): React.JSX.Element {
	const instructionsId = useId();
	const artifactsInId = useId();

	return (
		<section aria-label="What went in" className="min-w-0">
			<SectionTitle id={instructionsId}>
				Instructions this step loaded
			</SectionTitle>
			<InstructionsLoaded stage={stage} labelledBy={instructionsId} />
			<SectionTitle id={artifactsInId}>Artifacts in</SectionTitle>
			<ArtifactsIn record={record} stage={stage} labelledBy={artifactsInId} />
		</section>
	);
}

export { SectionTitle, WhatWentIn };
