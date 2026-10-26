import { useQuery } from "@tanstack/react-query";

import type { MonitoredStage } from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import plural from "#client/plural";

import { CorpusLine } from "./launch-case-list";

const NONE = 0;

type ReadEntry = Extract<
	MonitoredStage["readManifest"],
	{ readonly state: "available" }
>["entries"][number];

interface CorpusReads {
	readonly changed: number;
	readonly uncompared: number;
}

/** The distinct corpus files a step read, by whether each changed since. */
function corpusReads(entries: readonly ReadEntry[]): CorpusReads {
	const corpus = entries.filter(({ half }) => half === "corpus");
	const changed = new Set(
		corpus.filter(({ state }) => state === "changed").map(({ path }) => path),
	);
	const compared = new Set(
		corpus.filter(({ state }) => state !== undefined).map(({ path }) => path),
	);
	const uncompared = new Set(
		corpus.filter(({ path }) => !compared.has(path)).map(({ path }) => path),
	);

	return { changed: changed.size, uncompared: uncompared.size };
}

function notKnownReading(reasons: readonly string[]): string {
	return `· changed files not known: ${reasons.join("; ")}`;
}

/**
 * How many corpus files the replayed step loaded in its recorded run differ
 * now. No marker claims that every one was compared and none differs, so a
 * step whose reads cannot all be compared says so instead.
 */
function changedFilesReading(
	step: MonitoredStage | undefined,
): string | undefined {
	if (step === undefined) {
		return notKnownReading(["the step has no record in this run"]);
	}
	if (step.readManifest.state === "unavailable") {
		return notKnownReading(step.readManifest.reasons);
	}
	if (step.readManifestJudgment !== undefined) {
		return notKnownReading(step.readManifestJudgment.reasons);
	}

	return comparedReading(corpusReads(step.readManifest.entries));
}

function comparedReading({
	changed,
	uncompared,
}: CorpusReads): string | undefined {
	const changedReading = `· ${plural(changed, "file")} changed since ckpt`;
	if (uncompared === NONE) {
		return changed === NONE ? undefined : changedReading;
	}

	const uncomparedReading = `${plural(uncompared, "file")} not compared`;

	return changed === NONE
		? notKnownReading([uncomparedReading])
		: `${changedReading}, ${uncomparedReading}`;
}

interface ReplayCorpusLineProps {
	readonly run: string;
	readonly stage: string;
}

function ChangedSinceCheckpoint({
	run,
	stage,
}: ReplayCorpusLineProps): React.JSX.Element | null {
	const source = useQuery(runRecordQuery(run));
	let marker: string | undefined = "· checking changed files…";
	if (source.isError) {
		marker = notKnownReading(["the source run could not be read"]);
	} else if (!source.isFetching) {
		marker = changedFilesReading(
			source.data?.stages.find((each) => each.stage === stage),
		);
	}

	return marker === undefined ? null : (
		<span className="ml-2 text-12 text-muted-foreground">{marker}</span>
	);
}

/** The corpus a replay runs against, marked with what changed since its checkpoint. */
function ReplayCorpusLine({
	run,
	stage,
}: ReplayCorpusLineProps): React.JSX.Element {
	return (
		<>
			<CorpusLine />
			<ChangedSinceCheckpoint run={run} stage={stage} />
		</>
	);
}

export { ReplayCorpusLine as default };
