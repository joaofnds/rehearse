import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { LaunchDialog } from "#client/launch/launch-dialog";
import { Button } from "#client/system/ui/button";
import EditStepsDialog from "#client/tasks/edit-steps-dialog";

import type { RunRecordResponse } from "./run-record-query";
import { stageReplayRefusal } from "./run-record-query";
import { SectionTitle } from "./step-inputs";

/**
 * Replay opens the launch dialog on the checkpoint the stage started from,
 * and is disabled with the reason when that checkpoint is missing.
 */
interface ReplayFromCheckpointProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
}

function ReplayFromCheckpoint({
	run,
	record,
	stage,
}: ReplayFromCheckpointProps): React.JSX.Element {
	const reasonId = useId();
	const refusal = stageReplayRefusal(record, stage);
	if (refusal !== undefined) {
		return (
			<>
				<Button
					variant="outline"
					size="sm"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Replay from checkpoint
				</Button>
				<span id={reasonId} className="self-center text-12 text-dim">
					{refusal}
				</span>
			</>
		);
	}

	return (
		<LaunchDialog
			target={{ kind: "replay", run, stage }}
			trigger={
				<Button variant="outline" size="sm">
					Replay from checkpoint
				</Button>
			}
		/>
	);
}

/** The corpus file the step read as its skill, where its record names one. */
function corpusSkillPath(
	record: RunRecordResponse,
	stage: string,
): string | undefined {
	const reads = record.stages.find(
		(each) => each.stage === stage,
	)?.readManifest;
	if (reads?.state !== "available") {
		return undefined;
	}

	return reads.entries.find(
		({ role, half }) => role === "stage skill" && half === "corpus",
	)?.path;
}

interface OperateOnStepProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
}

function OperateOnStep({
	run,
	record,
	stage,
}: OperateOnStepProps): React.JSX.Element {
	const skill = corpusSkillPath(record, stage);

	return (
		<>
			<SectionTitle>Operate on this step</SectionTitle>
			<div className="mt-2 flex flex-wrap gap-2">
				<ReplayFromCheckpoint run={run} record={record} stage={stage} />
				<EditStepsDialog
					caseId={record.caseId}
					focusStage={stage}
					trigger={
						<Button variant="outline" size="sm">
							Edit this step
						</Button>
					}
				/>
				{skill === undefined ? null : (
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/corpus"
							search={{ file: skill, sourceRun: run, sourceStep: stage }}
						>
							Edit its skill
						</Link>
					</Button>
				)}
			</div>
			<p className="mt-2 text-12 text-pretty text-dim">
				Editing a step changes its case&apos;s pipeline file, which the next run
				reads. Its skill and the other instruction files are edited on the{" "}
				<Link to="/corpus">Corpus screen</Link>, which writes a new corpus
				version.
			</p>
		</>
	);
}

export { OperateOnStep as default };
