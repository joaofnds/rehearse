import { Link } from "@tanstack/react-router";

import type {
	Evidence,
	EvidenceOwner,
	JudgedAnswer,
} from "#client/monitor/judged-items";
import { EvidenceLink, Label, SourceChip } from "#client/monitor/judged-items";
import type { StageSessionResponse } from "#client/monitor/stage-session-query";

import { NO_KEPT_TRANSCRIPT } from "./step-report";

interface CitedItem {
	readonly owner: EvidenceOwner;
	readonly index: number;
	readonly cited: Evidence;
}

interface CitedItemsProps {
	readonly run: string;
	readonly stage: string;
}

function citedItems(
	{ run, stage }: CitedItemsProps,
	judge: JudgedAnswer,
): readonly CitedItem[] {
	const sections = [
		["hardBlockers", judge.hardBlockers],
		["dimensions", judge.dimensions],
	] as const;

	return sections.flatMap(([section, items]) =>
		items.flatMap(({ id, evidence }) =>
			evidence.map((cited, index) => ({
				cited,
				index,
				owner: { item: id, run, section, stage },
			})),
		),
	);
}

interface FullSessionProps {
	readonly run: string;
	readonly stage: string;
	readonly session: StageSessionResponse | "unreadable" | undefined;
}

function FullSession({
	run,
	stage,
	session,
}: FullSessionProps): React.JSX.Element | null {
	if (session === undefined) {
		return null;
	}

	if (session === "unreadable") {
		return <>Could not read this step's session.</>;
	}

	if (session.state === "closed" && session.transcriptPath !== undefined) {
		return (
			<Link to="/runs/$run/stages/$stage" params={{ run, stage }}>
				Open the full session on disk
			</Link>
		);
	}

	return (
		<>
			The full session is not recorded:{" "}
			{session.state === "closed" || session.state === "running"
				? NO_KEPT_TRANSCRIPT
				: "the run recorded no session for this step"}
		</>
	);
}

interface WideEvidenceProps {
	readonly id: string;
	readonly items: readonly CitedItem[];
	readonly fullSession: React.ReactNode;
}

function WideEvidence({
	id,
	items,
	fullSession,
}: WideEvidenceProps): React.JSX.Element {
	return (
		<section
			id={id}
			aria-label="Cited evidence"
			className="border-t border-border bg-background px-3.5 py-3"
		>
			<Label>Cited evidence · {String(items.length)} items</Label>
			<ul>
				{items.map(({ owner, index, cited }) => (
					<li
						key={`${owner.section}:${owner.item}:${String(index)}`}
						className="mt-2.5 grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-ledger-evidence"
					>
						<div className="min-w-0 font-mono text-12 text-muted-foreground wrap-anywhere">
							<SourceChip cited={cited} />
							<div className="mt-1">
								<EvidenceLink owner={owner} index={index} cited={cited} />
							</div>
							<div className="mt-1 font-sans text-dim">
								supports {owner.item}
							</div>
						</div>
						{cited.quote === undefined ? null : (
							<blockquote className="min-w-0 border-l-2 border-deeper bg-card px-2.5 py-1.75 font-mono text-13 leading-transcript whitespace-pre-wrap wrap-anywhere text-bright">
								{cited.quote}
							</blockquote>
						)}
					</li>
				))}
			</ul>
			<p className="mt-3 text-12 text-dim">
				Uncited spans are not stored here. {fullSession}
			</p>
		</section>
	);
}

export { citedItems, FullSession, WideEvidence };
export type { FullSessionProps };
