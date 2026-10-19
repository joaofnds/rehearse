import { Link } from "@tanstack/react-router";

import type { ComparisonArm } from "#benchmark/comparison-record";
import plural from "#client/plural";

import type { ComparisonResponse } from "./comparison-response";

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

type CaseAttempts = ComparisonResponse["attempts"][string];

type Attempt = CaseAttempts[ComparisonArm][number];

type AvailableOutcomes = Extract<
	Attempt["outcomes"],
	{ readonly state: "available" }
>["outcomes"];

type CaseHistories = ComparisonResponse["attemptHistories"][string];

type HistoryLink = CaseHistories[ComparisonArm][number];

type ComparisonMode = ComparisonResponse["report"]["mode"];

function outcomeText(
	outcome: AvailableOutcomes[number],
	mode: ComparisonMode,
): string {
	if (mode === "session" && outcome.status === "JUDGED") {
		return outcome.successful
			? "Recorded checks passed"
			: "Recorded checks failed";
	}

	return outcome.status === "JUDGED"
		? outcome.grade
		: outcome.status.toLowerCase().replaceAll("_", " ");
}

interface OutcomesProps {
	readonly outcomes: Attempt["outcomes"];
	readonly mode: ComparisonMode;
}

function Outcomes({ outcomes, mode }: OutcomesProps): React.JSX.Element {
	if (outcomes.state === "unavailable") {
		return <span className="text-muted-foreground">outcome not recorded</span>;
	}

	const [only] = outcomes.outcomes;
	if (outcomes.outcomes.length === SINGLE_ITEM_COUNT && only !== undefined) {
		return (
			<span className="font-mono font-bold">{outcomeText(only, mode)}</span>
		);
	}

	return (
		<span className="flex flex-col">
			{outcomes.outcomes.map((outcome) => (
				<span key={outcome.name} className="font-mono">
					{`${outcome.name} `}
					<span className="font-bold">{outcomeText(outcome, mode)}</span>
				</span>
			))}
		</span>
	);
}

function blockersText(blockersFired: Attempt["blockersFired"]): string {
	if (blockersFired.state === "unavailable") {
		return "blockers not recorded";
	}
	if (blockersFired.blockers.length === EMPTY_COLLECTION_LENGTH) {
		return "no blocker fired";
	}

	return `fired ${blockersFired.blockers.map(({ stage, id }) => `${stage} · ${id}`).join(", ")}`;
}

function wordsText(words: Attempt["words"]): string {
	return words.state === "available"
		? plural(words.words, "word")
		: "words not recorded";
}

interface HistoryProps {
	readonly digest: string | undefined;
	readonly role: string;
	readonly position: number;
	readonly link: HistoryLink | undefined;
}

function History({
	digest,
	role,
	position,
	link,
}: HistoryProps): React.JSX.Element | null {
	if (link === undefined) {
		return null;
	}
	if (link.status === "stale") {
		return (
			<span
				className="text-muted-foreground"
				title="Saved provenance no longer matches"
			>
				history stale
			</span>
		);
	}

	return (
		<Link
			to={link.href}
			search={{ comparison: digest, view: "context" }}
			aria-label={`${role} attempt ${String(position)} history`}
			className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
		>
			history
		</Link>
	);
}

interface AttemptCellProps {
	readonly digest: string | undefined;
	readonly role: string;
	readonly position: number;
	readonly mode: ComparisonMode;
	readonly attempt: Attempt | undefined;
	readonly link: HistoryLink | undefined;
}

function AttemptCell({
	digest,
	mode,
	role,
	position,
	attempt,
	link,
}: AttemptCellProps): React.JSX.Element {
	if (attempt === undefined) {
		return <span className="text-muted-foreground">no attempt</span>;
	}

	return (
		<div className="flex flex-col gap-0.5">
			{link?.status === "available" ? (
				<Link
					to={link.href}
					search={{ comparison: digest, view: "results" }}
					aria-label={`${role} attempt ${String(position)} results`}
					className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				>
					<Outcomes outcomes={attempt.outcomes} mode={mode} />
				</Link>
			) : (
				<Outcomes outcomes={attempt.outcomes} mode={mode} />
			)}
			{mode === "session" ? (
				<SessionAttemptChecks attempt={attempt} />
			) : (
				<span className="text-12">{blockersText(attempt.blockersFired)}</span>
			)}
			<span className="font-mono text-12">{wordsText(attempt.words)}</span>
			<History digest={digest} role={role} position={position} link={link} />
		</div>
	);
}

interface SessionAttemptChecksProps {
	readonly attempt: Attempt;
}

function SessionAttemptChecks({
	attempt,
}: SessionAttemptChecksProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1 text-12">
			<span>
				{attempt.checks === undefined
					? "Reply / transcript: not recorded"
					: `Reply / transcript: ${attempt.checks.passed}/${attempt.checks.declared} checks passed`}
			</span>
			<span>
				{attempt.stateChecks === undefined
					? "Saved state: not recorded"
					: `Saved state: ${attempt.stateChecks.passed}/${attempt.stateChecks.declared} checks passed`}
			</span>
			{attempt.stateChecks === undefined ||
			attempt.stateChecks.failing.length === EMPTY_COLLECTION_LENGTH ? null : (
				<details className="text-negative">
					<summary className="cursor-pointer">
						{plural(attempt.stateChecks.failing.length, "failed state check")}
					</summary>
					<div className="mt-2 flex flex-col gap-1">
						{attempt.stateChecks.failing.map(({ name, detail }) => (
							<span key={name}>{`${name}: ${detail}`}</span>
						))}
					</div>
				</details>
			)}
		</div>
	);
}

export { AttemptCell as default };
export type { Attempt, CaseAttempts, CaseHistories, ComparisonMode };
