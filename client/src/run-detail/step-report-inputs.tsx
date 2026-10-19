import { Link } from "@tanstack/react-router";

import type { MonitoredStage } from "#client/monitor/run-record-query";

import StepOutputs from "./step-outputs";
import type { SessionRead } from "./step-report-readings";
import {
	HASH_SHOWN,
	NO_KEPT_TRANSCRIPT,
	SectionTitle,
	notRecorded,
} from "./step-report-readings";

const EMPTY_COLLECTION_LENGTH = 0;

const PREFIX_START_INDEX = 0;

type ReadEntry = Extract<
	MonitoredStage["readManifest"],
	{ readonly state: "available" }
>["entries"][number];

interface SessionOnDiskProps {
	readonly run: string;
	readonly stage: string;
	readonly session: SessionRead;
}

function SessionOnDisk({
	run,
	stage,
	session,
}: SessionOnDiskProps): React.JSX.Element | null {
	if (
		session === "loading" ||
		session === "unreadable" ||
		session.state !== "closed"
	) {
		return null;
	}

	return (
		<p className="mt-1 text-12 text-muted-foreground">
			Session on disk:{" "}
			{session.transcriptPath === undefined ? (
				`not recorded: ${NO_KEPT_TRANSCRIPT}`
			) : (
				<Link
					to="/runs/$run/stages/$stage"
					params={{ run, stage }}
					className="font-mono wrap-anywhere"
				>
					{session.transcriptPath}
				</Link>
			)}
		</p>
	);
}

function notComparedReason(entry: ReadEntry): string {
	if (entry.half === "project") {
		return "a project file is not part of the corpus";
	}

	if (entry.sha256 === undefined) {
		return "no hash was recorded";
	}

	return "the corpus under test cannot compare it";
}

interface ReadStateProps {
	readonly entry: ReadEntry;
}

function ReadState({ entry }: ReadStateProps): React.JSX.Element {
	if (entry.state === "unchanged") {
		return (
			<>
				<span aria-hidden="true">✓</span>unchanged
			</>
		);
	}

	if (entry.state === "changed") {
		return (
			<>
				<span aria-hidden="true">⚠</span>changed since this run
			</>
		);
	}

	return <>not compared · {notComparedReason(entry)}</>;
}

interface InstructionsReadProps {
	readonly stage: MonitoredStage;
}

function InstructionsRead({ stage }: InstructionsReadProps): React.JSX.Element {
	const { readManifest } = stage;

	return (
		<>
			<SectionTitle>Instructions this step read</SectionTitle>
			{readManifest.state === "unavailable" ? (
				<p className="mt-2 text-14 text-attention">
					{notRecorded("Instructions read", readManifest.reasons)}
				</p>
			) : (
				<div
					role="region"
					aria-label="Instruction read manifest"
					tabIndex={0}
					className="relative mt-2 min-w-0 overflow-x-auto rounded-md border border-divider"
				>
					<InstructionReadTable entries={readManifest.entries} />
				</div>
			)}
		</>
	);
}

interface InstructionReadTableProps {
	readonly entries: readonly ReadEntry[];
}

function InstructionReadTable({
	entries,
}: InstructionReadTableProps): React.JSX.Element {
	return (
		<table
			aria-label="Instructions this step read"
			className="min-w-120 w-full max-w-225 font-mono text-12"
		>
			<thead className="sr-only">
				<tr>
					<th>Path</th>
					<th>Hash</th>
					<th>Since this run</th>
				</tr>
			</thead>
			<tbody>
				{entries.map((entry) => (
					<tr
						key={`${entry.half}:${entry.path}`}
						className="border-b border-subtle"
					>
						<td className="px-2.75 py-1.5">{entry.path}</td>
						<td className="px-2.75 py-1.5 text-dim">
							{entry.sha256?.slice(PREFIX_START_INDEX, HASH_SHOWN) ?? "no hash"}
						</td>
						<td className="px-2.75 py-1.5 font-sans text-12 text-muted-foreground">
							<span className="flex items-center gap-1.25">
								<ReadState entry={entry} />
							</span>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function artifactLabel(
	entry: MonitoredStage["artifactsIn"]["entries"][number],
): string {
	if (entry.from === "earlier stage") {
		return `${entry.path} · ${entry.change} by ${entry.stage}`;
	} else if (entry.from === "task declaration") {
		return `${entry.taskId} · task declaration`;
	}

	const checkpoint =
		entry.checkpointShortId.state === "available"
			? entry.checkpointShortId.shortId
			: `${entry.upstream} checkpoint`;
	return `${entry.target} · ${checkpoint} · frozen starting checkpoint`;
}

interface StepRecordedInputsProps {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly sessionRead: SessionRead;
}

function StepRecordedInputs({
	run,
	stage,
	sessionRead,
}: StepRecordedInputsProps): React.JSX.Element {
	return (
		<details className="mt-4 rounded-lg border border-border">
			<summary className="cursor-pointer px-4 py-3 text-14">
				Input &amp; checkpoint
			</summary>
			<div className="px-4 pb-4">
				<p className="text-12 text-dim">
					{stage.artifactsIn.entries.length === EMPTY_COLLECTION_LENGTH
						? "No input artifacts recorded."
						: "Saved input artifacts"}
				</p>
				<StepInputArtifacts stage={stage} />
				{stage.artifactsIn.missing.map(({ part, reason }) => (
					<p key={part} className="mt-2 text-12 text-dim">
						{part}: {reason}
					</p>
				))}
				<StepOutputs stage={stage} />
				<InstructionsRead stage={stage} />
				<SessionOnDisk run={run} stage={stage.stage} session={sessionRead} />
			</div>
		</details>
	);
}

interface StepInputArtifactsProps {
	readonly stage: MonitoredStage;
}

function StepInputArtifacts({
	stage,
}: StepInputArtifactsProps): React.JSX.Element {
	return (
		<ul className="mt-2 space-y-2 text-12">
			{stage.artifactsIn.entries.map((entry, index) => {
				const label = artifactLabel(entry);
				return (
					<li key={index} className="font-mono wrap-anywhere">
						{label}
					</li>
				);
			})}
		</ul>
	);
}

export { ReadState, StepRecordedInputs };
export type { ReadEntry };
