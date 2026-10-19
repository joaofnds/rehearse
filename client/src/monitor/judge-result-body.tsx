import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import { Grade } from "#client/system/components/grade";

import type { JudgedItems, SectionCount, Verdict } from "./judge-reading-model";
import { BlockerRows, DimensionRows, Label } from "./judged-items";
import rerunSpreadSentence from "./rerun-spread";

interface VerdictCardProps {
	readonly verdict: Verdict;
}

function VerdictCard({ verdict }: VerdictCardProps): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label="Verdict and grade"
			className="flex items-center gap-3 rounded-card border border-strong bg-raised px-3.75 py-3"
		>
			<div>
				<Label>Verdict</Label>
				<div className="mt-0.5 flex items-center gap-2.25">
					<span aria-hidden="true" className="text-12 text-dim">
						{verdict.glyph}
					</span>
					<span className="text-14 text-secondary-foreground">
						{verdict.phrase}
					</span>
				</div>
			</div>
			<div className="ml-auto text-right">
				<Label>Grade</Label>
				<Grade
					value={
						verdict.grade === undefined
							? { pending: true }
							: { letter: verdict.grade }
					}
					size="verdict"
				/>
			</div>
		</div>
	);
}

interface SectionHeadingProps {
	readonly title: string;
	readonly count: SectionCount;
	readonly counted: string;
}

function SectionHeading({
	title,
	count,
	counted,
}: SectionHeadingProps): React.JSX.Element {
	return (
		<h3 className="mt-5 text-12 tracking-label text-dim uppercase">
			{title}{" "}
			<span className="tracking-normal text-muted-foreground normal-case">
				· {String(count.returned)} of {String(count.total)} {counted}
			</span>
		</h3>
	);
}

/** The design's variance note (SPEC.md 2d): product rule 1, a grade read as one attempt. */
interface VarianceNoteProps {
	readonly run: string;
	readonly stage: string;
}

function VarianceNote({ run, stage }: VarianceNoteProps): React.JSX.Element {
	const { data } = useQuery(polledRunListingQuery);
	const spread =
		data === undefined
			? undefined
			: rerunSpreadSentence(data.rows, { run, stage });

	return (
		<div
			role="note"
			className="mt-5 rounded-card border border-border bg-raised px-3.75 py-3"
		>
			<Label>Read this as one attempt</Label>
			<p className="mt-1.5 text-12 text-pretty text-muted-foreground">
				{spread === undefined ? null : `${spread} `}A single grade is a data
				point, not a score.{" "}
				<Link to="/comparisons" className="border-b border-deeper text-link">
					Compare arms
				</Link>{" "}
				to say whether an edit moved anything.
			</p>
		</div>
	);
}

interface JudgedBodyProps {
	readonly run: string;
	readonly stage: string;
	readonly verdict: Verdict;
	readonly items: JudgedItems | undefined;
}

function JudgedBody({
	run,
	stage,
	verdict,
	items,
}: JudgedBodyProps): React.JSX.Element {
	return (
		<>
			<VerdictCard verdict={verdict} />
			{items === undefined ? null : (
				<>
					<SectionHeading
						title="Hard blockers"
						count={items.blockers.count}
						counted="evaluated"
					/>
					{items.blockers.rows === undefined ? null : (
						<BlockerRows run={run} stage={stage} rows={items.blockers.rows} />
					)}
					<SectionHeading
						title="Quality dimensions"
						count={items.dimensions.count}
						counted="returned"
					/>
					{items.dimensions.rows === undefined ? null : (
						<DimensionRows
							run={run}
							stage={stage}
							rows={items.dimensions.rows}
						/>
					)}
				</>
			)}
			<VarianceNote run={run} stage={stage} />
		</>
	);
}

export { JudgedBody as default };
