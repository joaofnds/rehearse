import { useId, useState } from "react";

import EvidenceDialogLink from "#client/evidence/evidence-dialog";
import useKeyShortcut from "#client/shell/use-key-shortcut";

import type { JudgedAnswer } from "./judged-items";

const EMPTY_COLLECTION_LENGTH = 0;

type Evidence = JudgedAnswer["hardBlockers"][number]["evidence"][number];

/** A row's evidence: what the record cites, or pending until the record exists. */
type RowEvidence = readonly Evidence[] | "pending";

/** What a closed toggle says of the evidence it would open. */
function closedToggleWords(evidence: RowEvidence): string {
	if (evidence === "pending") {
		return "evidence pending";
	}

	return evidence.length === EMPTY_COLLECTION_LENGTH
		? "no evidence"
		: `${String(evidence.length)} cited`;
}

function hasEvidence(evidence: RowEvidence): boolean {
	return evidence !== "pending" && evidence.length > EMPTY_COLLECTION_LENGTH;
}

interface EvidenceToggleProps {
	readonly evidence: RowEvidence;
	readonly shown: string | undefined;
	readonly onToggle: () => void;
}

function EvidenceToggle({
	evidence,
	shown,
	onToggle,
}: EvidenceToggleProps): React.JSX.Element {
	const disabled = !hasEvidence(evidence);

	return (
		<button
			type="button"
			aria-expanded={shown !== undefined}
			aria-controls={shown}
			aria-disabled={disabled || undefined}
			onClick={disabled ? undefined : onToggle}
			className="flex-none rounded-tight border border-strong px-2.25 py-0.5 text-14 text-muted-foreground"
		>
			{shown === undefined ? closedToggleWords(evidence) : "hide evidence"}
		</button>
	);
}

interface EvidenceOwner {
	readonly run: string;
	readonly stage: string;
	readonly section: "hardBlockers" | "dimensions";
	readonly item: string;
}

interface SourceChipProps {
	readonly cited: Evidence;
}

function SourceChip({ cited }: SourceChipProps): React.JSX.Element {
	return (
		<span className="rounded-sm border border-strong px-1.5 py-0.25">
			{cited.source}
		</span>
	);
}

/** The cited item's locator, or else its path, opening the evidence page. */
interface EvidenceLinkProps {
	readonly owner: EvidenceOwner;
	readonly index: number;
	readonly cited: Evidence;
}

function EvidenceLink({
	owner,
	index,
	cited,
}: EvidenceLinkProps): React.JSX.Element {
	return (
		<EvidenceDialogLink
			identity={{ kind: "stage", ...owner, index: String(index) }}
		>
			{cited.place ?? cited.path}
		</EvidenceDialogLink>
	);
}

interface CitedEvidenceProps {
	readonly owner: EvidenceOwner;
	readonly evidence: readonly Evidence[];
	readonly spacing: string;
}

function CitedEvidence({
	owner,
	evidence,
	spacing,
}: CitedEvidenceProps): React.JSX.Element {
	return (
		<>
			{evidence.map((cited, index) => (
				<div
					// The record keeps an item's evidence in the order it was cited.
					key={String(index)}
					className={spacing}
				>
					<div className="flex min-w-0 flex-wrap items-center gap-2.5 font-mono text-12 wrap-anywhere text-muted-foreground">
						<SourceChip cited={cited} />
						<EvidenceLink owner={owner} index={index} cited={cited} />
					</div>
					{cited.quote === undefined ? null : (
						<blockquote className="mt-1.5 border-l border-strong px-2.75 py-1.75 font-mono text-13 leading-transcript whitespace-pre-wrap wrap-anywhere text-bright">
							{cited.quote}
						</blockquote>
					)}
				</div>
			))}
		</>
	);
}

/**
 * One rubric item: its row, and beneath it inside the same list item the
 * evidence its toggle opens once the record holds it. The `e` shortcut opens
 * it with every other item on screen (SPEC.md:356).
 */
interface ItemWithEvidenceProps {
	readonly owner: EvidenceOwner;
	readonly evidence: RowEvidence;
	readonly rowClassName: string;
	readonly panelClassName: string;
	readonly label?: string;
	readonly spacing: string;
	readonly children: React.ReactNode;
}

function ItemWithEvidence({
	owner,
	evidence,
	rowClassName,
	panelClassName,
	label,
	spacing,
	children,
}: ItemWithEvidenceProps): React.JSX.Element {
	const [toggled, setToggled] = useState(false);
	const evidenceId = useId();
	const cited = toggled && evidence !== "pending" ? evidence : undefined;
	useKeyShortcut(hasEvidence(evidence) ? "e" : undefined, () => {
		setToggled(true);
	});

	return (
		<li>
			<div className={rowClassName}>
				{children}
				<EvidenceToggle
					evidence={evidence}
					shown={cited === undefined ? undefined : evidenceId}
					onToggle={() => {
						setToggled((shown) => !shown);
					}}
				/>
			</div>
			{cited === undefined ? null : (
				<div
					id={evidenceId}
					className={`mt-0.5 border-l-2 border-deeper bg-background px-3.5 py-2.75 ${panelClassName}`}
				>
					{label === undefined ? null : <Label>{label}</Label>}
					<CitedEvidence owner={owner} evidence={cited} spacing={spacing} />
				</div>
			)}
		</li>
	);
}

/** The pane label the design sets in small capitals. */
interface LabelProps {
	readonly children: React.ReactNode;
}

function Label({ children }: LabelProps): React.JSX.Element {
	return (
		<div className="text-12 tracking-label text-dim uppercase">{children}</div>
	);
}

export {
	ItemWithEvidence as default,
	EvidenceLink,
	EvidenceToggle,
	Label,
	SourceChip,
};
export type { Evidence, EvidenceOwner, RowEvidence };
