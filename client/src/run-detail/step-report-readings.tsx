import minutesAndSeconds from "#client/monitor/minutes-and-seconds";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import type { StageSessionResponse } from "#client/monitor/stage-session-query";

import stageCostReading from "./step-readings";

const LINE_COUNT = new Intl.NumberFormat("en-US");

const HASH_SHOWN = 6;

function notRecorded(figure: string, reasons: readonly string[]): string {
	return `${figure} not recorded: ${reasons.join("; ")}`;
}

function skillReading(stage: MonitoredStage): string {
	const { readManifest } = stage;
	if (readManifest.state === "unavailable") {
		return notRecorded("skill", readManifest.reasons);
	}

	const skill = readManifest.entries.find(({ role }) => role === "stage skill");

	return (
		skill?.path ??
		notRecorded("skill", ["the stage's reads name no stage skill"])
	);
}

function wallTimeReading(stage: MonitoredStage): string {
	return stage.wallTime.state === "available"
		? minutesAndSeconds(stage.wallTime.ms)
		: notRecorded("wall time", stage.wallTime.reasons);
}

const NO_KEPT_TRANSCRIPT = "Rehearse kept no copy of this step's session";

function transcriptReading(session: StageSessionResponse): string {
	if (session.state === "closed" || session.state === "running") {
		return session.lineCount === undefined
			? notRecorded("transcript", [NO_KEPT_TRANSCRIPT])
			: `${LINE_COUNT.format(session.lineCount)} transcript lines`;
	}

	return notRecorded("transcript", [
		session.state === "not-started"
			? "the step has not started"
			: "the run recorded no session id for this step",
	]);
}

type SessionRead = StageSessionResponse | "loading" | "unreadable";

function metaLine(stage: MonitoredStage, session: SessionRead): string {
	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
		...(session === "loading"
			? []
			: [
					session === "unreadable"
						? "transcript not read: could not read this step's session"
						: transcriptReading(session),
				]),
	].join(" · ");
}

interface SectionTitleProps {
	readonly children: React.ReactNode;
}

function SectionTitle({ children }: SectionTitleProps): React.JSX.Element {
	return (
		<h3 className="mt-4.5 text-12 tracking-label text-dim uppercase">
			{children}
		</h3>
	);
}

export {
	HASH_SHOWN,
	LINE_COUNT,
	metaLine,
	NO_KEPT_TRANSCRIPT,
	notRecorded,
	SectionTitle,
	skillReading,
	wallTimeReading,
};
export type { SessionRead };
