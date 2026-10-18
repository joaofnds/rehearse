import { Link } from "@tanstack/react-router";
import type { ComparisonArm } from "#benchmark/comparison-record";
import { plural } from "#client/plural";
import { TableShell } from "#client/system/components/table-shell";
import type { ComparisonResponse } from "./comparison-response";
import { DESIGN_ARMS } from "./design-arms";

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

function Outcomes({
	outcomes,
	mode,
}: {
	readonly outcomes: Attempt["outcomes"];
	readonly mode: ComparisonMode;
}): React.JSX.Element {
	if (outcomes.state === "unavailable") {
		return <span className="text-muted-foreground">outcome not recorded</span>;
	}

	const [only] = outcomes.outcomes;
	if (outcomes.outcomes.length === 1 && only !== undefined) {
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
	if (blockersFired.blockers.length === 0) {
		return "no blocker fired";
	}

	return `fired ${blockersFired.blockers.map(({ stage, id }) => `${stage} · ${id}`).join(", ")}`;
}

function wordsText(words: Attempt["words"]): string {
	return words.state === "available"
		? plural(words.words, "word")
		: "words not recorded";
}

function History({
	digest,
	role,
	position,
	link,
}: {
	readonly digest: string | undefined;
	readonly role: string;
	readonly position: number;
	readonly link: HistoryLink | undefined;
}): React.JSX.Element | null {
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
			search={{ view: "context", comparison: digest }}
			aria-label={`${role} attempt ${String(position)} history`}
			className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
		>
			history
		</Link>
	);
}

function AttemptCell({
	digest,
	mode,
	role,
	position,
	attempt,
	link,
}: {
	readonly digest: string | undefined;
	readonly role: string;
	readonly position: number;
	readonly mode: ComparisonMode;
	readonly attempt: Attempt | undefined;
	readonly link: HistoryLink | undefined;
}): React.JSX.Element {
	if (attempt === undefined) {
		return <span className="text-muted-foreground">no attempt</span>;
	}

	return (
		<div className="flex flex-col gap-0.5">
			{link?.status === "available" ? (
				<Link
					to={link.href}
					search={{ view: "results", comparison: digest }}
					aria-label={`${role} attempt ${String(position)} results`}
					className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				>
					<Outcomes outcomes={attempt.outcomes} mode={mode} />
				</Link>
			) : (
				<Outcomes outcomes={attempt.outcomes} mode={mode} />
			)}
			{mode === "session" ? (
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
					attempt.stateChecks.failing.length === 0 ? null : (
						<details className="text-negative">
							<summary className="cursor-pointer">
								{plural(
									attempt.stateChecks.failing.length,
									"failed state check",
								)}
							</summary>
							<div className="mt-2 flex flex-col gap-1">
								{attempt.stateChecks.failing.map(({ name, detail }) => (
									<span key={name}>{`${name}: ${detail}`}</span>
								))}
							</div>
						</details>
					)}
				</div>
			) : (
				<span className="text-12">{blockersText(attempt.blockersFired)}</span>
			)}
			<span className="font-mono text-12">{wordsText(attempt.words)}</span>
			<History digest={digest} role={role} position={position} link={link} />
		</div>
	);
}

function unrecordedReasons(
	attempts: CaseAttempts,
	reasonOf: (attempt: Attempt) => string | undefined,
): readonly string[] {
	const reasons = DESIGN_ARMS.flatMap(({ arm }) => attempts[arm]).flatMap(
		(attempt) => reasonOf(attempt) ?? [],
	);

	return [...new Set(reasons)];
}

function Note({
	label,
	reasons,
}: {
	readonly label: string;
	readonly reasons: readonly string[];
}): React.JSX.Element | null {
	if (reasons.length === 0) {
		return null;
	}

	return <p>{`${label}: ${reasons.join("; ")}.`}</p>;
}

function attemptRow(
	digest: string | undefined,
	mode: ComparisonMode,
	position: number,
	attempts: CaseAttempts,
	histories: CaseHistories | undefined,
): readonly React.ReactNode[] {
	const cells = DESIGN_ARMS.map(({ arm, role }) => {
		const attempt = attempts[arm][position - 1];
		const cell = (
			<AttemptCell
				digest={digest}
				mode={mode}
				role={role}
				position={position}
				attempt={attempt}
				link={
					attempt === undefined
						? undefined
						: histories?.[arm].find(({ repId }) => repId === attempt.repId)
				}
			/>
		);

		return (
			<div
				key={arm}
				className={arm === "control" ? "text-muted-foreground" : undefined}
			>
				{cell}
			</div>
		);
	});

	return [`Attempt ${String(position)}`, ...cells];
}

/**
 * Each arm's attempts side by side, in the order each arm recorded them. A
 * row holds each arm's attempt at that position and claims no change between
 * them, since no record ties one arm's attempt to another's.
 */
export function AttemptPairs({
	digest,
	caseId,
	mode,
	attempts,
	histories,
}: {
	readonly digest: string;
	readonly caseId: string;
	readonly mode: ComparisonMode;
	readonly attempts: CaseAttempts;
	readonly histories: CaseHistories | undefined;
}): React.JSX.Element {
	const rows = Math.max(...DESIGN_ARMS.map(({ arm }) => attempts[arm].length));
	const positions = Array.from({ length: rows }, (_empty, index) => index + 1);

	return (
		<div className="flex max-w-283 flex-col gap-2">
			<TableShell
				className="min-w-240 table-fixed"
				columnClasses={["w-28", "", "", ""]}
				caption={
					<>
						{"Attempt pairs · "}
						<span className="font-mono tracking-normal normal-case">
							{caseId}
						</span>
					</>
				}
				columns={["Attempt", ...DESIGN_ARMS.map(({ role }) => role)]}
				rows={positions.map((position) =>
					attemptRow(digest, mode, position, attempts, histories),
				)}
			/>
			<div className="flex flex-col gap-1 text-12 text-muted-foreground">
				{mode === "session" ? null : (
					<p>{`No attempt history to open: a ${mode} comparison's attempts record no session.`}</p>
				)}
				<Note
					label="Outcomes not recorded"
					reasons={unrecordedReasons(attempts, ({ outcomes }) =>
						outcomes.state === "unavailable" ? outcomes.reason : undefined,
					)}
				/>
				<Note
					label="Words not recorded"
					reasons={unrecordedReasons(attempts, ({ words }) =>
						words.state === "unavailable" ? words.reason : undefined,
					)}
				/>
				<Note
					label="Blockers not recorded"
					reasons={unrecordedReasons(attempts, ({ blockersFired }) =>
						blockersFired.state === "unavailable"
							? blockersFired.reason
							: undefined,
					)}
				/>
			</div>
		</div>
	);
}
