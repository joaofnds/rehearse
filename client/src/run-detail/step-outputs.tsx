import { useId } from "react";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import { hasEnded } from "#client/monitor/run-record-query";

type MissingPart = MonitoredStage["artifactsIn"]["missing"][number];

interface ArtifactOutRow {
	readonly name: string;
	readonly detail: string;
}

/** Each artifact the stage's record says it produced, with the detail the record holds. */
function artifactOutRows(stage: MonitoredStage): readonly ArtifactOutRow[] {
	const { declared, workflowState, commitSubjects, changedPaths } =
		stage.artifactsOut;

	return [
		...(declared.state === "available"
			? declared.paths.map((path) => ({
					name: path,
					detail: "declared artifact",
				}))
			: []),
		...(workflowState.state === "available"
			? workflowState.changes.map(({ path, change }) => ({
					name: path,
					detail: `workflow state · ${change}`,
				}))
			: []),
		...(commitSubjects.state === "available"
			? commitSubjects.subjects.map((subject) => ({
					name: subject,
					detail: "commit",
				}))
			: []),
		...(changedPaths.state === "available"
			? changedPaths.paths.map((path) => ({
					name: path,
					detail: "changed path",
				}))
			: []),
	];
}

/**
 * Each part of an ended stage's artifacts out its record cannot read, so an
 * unreadable record does not pass for one that produced nothing.
 */
function unreadArtifactsOut(stage: MonitoredStage): readonly MissingPart[] {
	if (!hasEnded(stage)) {
		return [];
	}

	const { declared, workflowState, commitSubjects, changedPaths } =
		stage.artifactsOut;

	return [
		{ part: "the declared artifact", reading: declared },
		{ part: "the workflow-state changes", reading: workflowState },
		{ part: "the commit subjects", reading: commitSubjects },
		{ part: "the changed paths", reading: changedPaths },
	].flatMap(({ part, reading }) =>
		reading.state === "unavailable"
			? [{ part, reason: reading.reasons.join("; ") }]
			: [],
	);
}

export function StepOutputs({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element | null {
	const headingId = useId();
	const rows = artifactOutRows(stage);
	const unread = unreadArtifactsOut(stage);
	if (rows.length === 0 && unread.length === 0) {
		return null;
	}

	return (
		<>
			<h3
				id={headingId}
				className="mt-3.5 text-10 tracking-label text-dim uppercase"
			>
				Artifacts out
			</h3>
			<ul aria-labelledby={headingId} className="mt-2 flex flex-col gap-1">
				{rows.map(({ name, detail }, index) => (
					<li
						key={`${detail}:${name}:${index}`}
						className="flex items-center gap-2.25 rounded-md border border-deeper bg-selected px-2.5 py-1.5"
					>
						<span aria-hidden="true" className="text-muted-foreground">
							↑
						</span>
						<span className="flex-1 font-mono text-11-5 wrap-anywhere">
							{name}
						</span>
						<span className="font-mono text-10-5 text-muted-foreground">
							{detail}
						</span>
					</li>
				))}
			</ul>
			{unread.map(({ part, reason }) => (
				<p key={part} className="mt-1.5 text-11 text-dim">
					Not read: {part}, as {reason}
				</p>
			))}
		</>
	);
}
