import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import plural from "#client/plural";
import isClean from "#client/run-history/clean-record";
import { Grade } from "#client/system/components/grade";

import type { StageAttemptsResponse } from "./stage-attempts-query";
import { stageAttemptsQuery } from "./stage-attempts-query";

type StageAttempt = StageAttemptsResponse["attempts"][number];

const KIND_WORDS = {
	original: "original run",
	rep: "confirmation rep",
	replay: "replay",
} as const satisfies Record<StageAttempt["kind"], string>;

/**
 * Whether the attempt still measures the corpus under test, and why not. As
 * in run history, only an attempt recorded at the version under test with
 * nothing changed reads as current; one whose reads are unchanged under a
 * later version is clear.
 */
function stalenessReading(staleness: StageAttempt["staleness"]): string {
	if (staleness.state === "unavailable") {
		return `staleness not known: ${staleness.reasons.join("; ")}`;
	}
	if (staleness.stale) {
		return `⚠ stale · ${staleness.causes.join("; ")}`;
	}
	if (isClean(staleness)) {
		return "✓ current corpus";
	}
	const { distance } = staleness;

	return distance.kind === "not-recorded"
		? `✓ clear · nothing it read changed; ${distance.reason}`
		: `✓ clear · nothing it read changed across ${plural(distance.versions, "later corpus version")}`;
}

/** What the list shows of an attempt's grade and corpus. */
interface AttemptFigures {
	readonly letter: string | undefined;
	readonly corpus: string;
}

/** The original run's grade and corpus are the run record's; the others recorded their own. */
function attemptFigures(
	attempt: StageAttempt,
	stage: MonitoredStage,
): AttemptFigures {
	if (attempt.kind === "original") {
		return {
			corpus: corpusMeasurementReading(stage.corpusVersion),
			letter:
				stage.grade.state === "available" ? stage.grade.letter : undefined,
		};
	}

	return {
		corpus: corpusMeasurementReading(attempt.corpusVersion),
		letter: attempt.grade,
	};
}

interface AttemptItemProps {
	readonly attempt: StageAttempt;
	readonly stage: MonitoredStage;
}

function AttemptItem({ attempt, stage }: AttemptItemProps): React.JSX.Element {
	const { letter, corpus } = attemptFigures(attempt, stage);

	return (
		<li className="rounded-card border border-border px-2.5 py-2">
			<span className="flex items-center gap-2">
				<span className="flex-1 font-mono text-12">
					{attempt.href === undefined ? (
						attempt.id
					) : (
						<Link
							to={attempt.href}
							className="text-link underline underline-offset-4"
						>
							{attempt.id}
						</Link>
					)}
				</span>
				<Grade
					size="inline"
					value={letter === undefined ? { pending: true } : { letter }}
				/>
			</span>
			<span className="mt-0.5 block text-12 text-muted-foreground">
				{KIND_WORDS[attempt.kind]} · {corpus}
			</span>
			<span className="mt-0.5 block text-12 text-dim">
				{stalenessReading(attempt.staleness)}
			</span>
		</li>
	);
}

/**
 * Every attempt at the checkpoint the selected stage started from (SPEC.md
 * 4a): the original run, replays and judged confirmation reps, each with its
 * grade, corpus version and whether that corpus is still the one under test.
 */
interface CheckpointAttemptsProps {
	readonly run: string;
	readonly stage: MonitoredStage;
}

function CheckpointAttempts({
	run,
	stage,
}: CheckpointAttemptsProps): React.JSX.Element {
	const { data, isError } = useQuery(stageAttemptsQuery(run, stage.stage));

	return (
		<section aria-label="Attempts" className="mt-4 px-1.5">
			<h2 className="pb-2 text-16 tracking-label text-dim uppercase">
				Attempts at {data?.checkpoint ?? "this step's checkpoint"}
			</h2>
			{isError ? (
				<p className="text-12 text-muted-foreground">
					Could not read the attempts at this checkpoint.
				</p>
			) : null}
			{data === undefined ? null : (
				<>
					<ul
						aria-label={`Attempts at ${data.checkpoint}`}
						className="flex flex-col gap-1"
					>
						{data.attempts.map((attempt) => (
							<AttemptItem key={attempt.id} attempt={attempt} stage={stage} />
						))}
					</ul>
					<Link
						to="/comparisons"
						className="mt-2 inline-block border-b border-deeper text-14 text-link"
					>
						Compare these attempts
					</Link>
				</>
			)}
		</section>
	);
}

export { CheckpointAttempts as default };
