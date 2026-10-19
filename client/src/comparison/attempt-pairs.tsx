import TableShell from "#client/system/components/table-shell";

import type {
	Attempt,
	CaseAttempts,
	CaseHistories,
	ComparisonMode,
} from "./attempt-pair-cells";
import AttemptCell from "./attempt-pair-cells";
import { DESIGN_ARMS } from "./design-arms";

const EMPTY_COLLECTION_LENGTH = 0;

const ORDINAL_BASE = 1;

function unrecordedReasons(
	attempts: CaseAttempts,
	reasonOf: (attempt: Attempt) => string | undefined,
): readonly string[] {
	const reasons = DESIGN_ARMS.flatMap(({ arm }) => attempts[arm]).flatMap(
		(attempt) => reasonOf(attempt) ?? [],
	);

	return [...new Set(reasons)];
}

interface NoteProps {
	readonly label: string;
	readonly reasons: readonly string[];
}

function Note({ label, reasons }: NoteProps): React.JSX.Element | null {
	if (reasons.length === EMPTY_COLLECTION_LENGTH) {
		return null;
	}

	return <p>{`${label}: ${reasons.join("; ")}.`}</p>;
}

interface AttemptComparison {
	readonly digest: string | undefined;
	readonly mode: ComparisonMode;
}

interface CaseAttemptEvidence {
	readonly attempts: CaseAttempts;
	readonly histories: CaseHistories | undefined;
}

function attemptRow(
	{ digest, mode }: AttemptComparison,
	position: number,
	{ attempts, histories }: CaseAttemptEvidence,
): readonly React.ReactNode[] {
	const cells = DESIGN_ARMS.map(({ arm, role }) => {
		const attempt = attempts[arm][position - ORDINAL_BASE];
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
interface AttemptPairsProps {
	readonly digest: string;
	readonly caseId: string;
	readonly mode: ComparisonMode;
	readonly attempts: CaseAttempts;
	readonly histories: CaseHistories | undefined;
}

function AttemptPairs({
	digest,
	caseId,
	mode,
	attempts,
	histories,
}: AttemptPairsProps): React.JSX.Element {
	const rows = Math.max(...DESIGN_ARMS.map(({ arm }) => attempts[arm].length));
	const positions = Array.from(
		{ length: rows },
		(_empty, index) => index + ORDINAL_BASE,
	);

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
					attemptRow({ digest, mode }, position, { attempts, histories }),
				)}
			/>
			<AttemptCoverageNotes mode={mode} attempts={attempts} />
		</div>
	);
}

interface AttemptCoverageNotesProps {
	readonly mode: ComparisonMode;
	readonly attempts: CaseAttempts;
}

function AttemptCoverageNotes({
	mode,
	attempts,
}: AttemptCoverageNotesProps): React.JSX.Element {
	return (
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
	);
}

export { AttemptPairs as default };
