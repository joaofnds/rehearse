import {
	agreementPercent,
	agreementReading,
	reviewsLine,
	stepLabel,
} from "./calibration-figures";
import type { CalibrationResponse } from "./calibration-query";

const NO_RECORDED_REVIEWS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

type AgreementRow = CalibrationResponse["rows"][number];

const COLUMNS = [
	"Step",
	"Judge",
	"You",
	"Agreement",
	"Where you differed",
] as const;

const AGREEMENT_COLOURS = {
	"≈": "text-secondary-foreground",
	"✓": "text-muted-foreground",
	"✕": "text-foreground",
} as const;

interface SublineProps {
	readonly reviews: number;
	readonly withinOneStep: number;
}

function Subline({ reviews, withinOneStep }: SublineProps): React.JSX.Element {
	if (reviews === NO_RECORDED_REVIEWS) {
		return <>{reviewsLine(reviews)}</>;
	}

	return (
		<>
			{reviewsLine(reviews)} · agreement within one letter step on{" "}
			<span className="font-mono">
				{withinOneStep}/{reviews}
			</span>{" "}
			({agreementPercent(withinOneStep, reviews)})
		</>
	);
}

function whereTheyDiffered(row: AgreementRow): string {
	if (row.note !== null) {
		return row.note;
	}
	if (row.differences.length === EMPTY_COLLECTION_LENGTH) {
		return "—";
	}

	return row.differences
		.map(
			({ criterion, judge, operator }) =>
				`${criterion}: judge ${judge}, you ${operator}`,
		)
		.join("; ");
}

function rowFor(row: AgreementRow): readonly React.ReactNode[] {
	const agreement = agreementReading(row.stepsApart);

	return [
		<span key="step" className="font-mono text-13 text-secondary-foreground">
			{stepLabel(row.stage, row.stageName)}
		</span>,
		<span key="judge" className="font-mono font-bold">
			{row.judgeGrade}
		</span>,
		<span key="you" className="font-mono font-bold">
			{row.operatorGrade}
		</span>,
		<span
			key="agreement"
			className={`inline-flex items-center gap-1.5 text-14 ${AGREEMENT_COLOURS[agreement.glyph]}`}
		>
			<span aria-hidden="true">{agreement.glyph}</span>
			{agreement.label}
		</span>,
		<span key="differed" className="text-14 text-muted-foreground">
			{whereTheyDiffered(row)}
		</span>,
	];
}

export { COLUMNS, NO_RECORDED_REVIEWS, rowFor, Subline };
