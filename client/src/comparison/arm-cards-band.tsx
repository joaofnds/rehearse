import type { ComparisonArm } from "#benchmark/comparison-record";
import { SectionLabel } from "#client/system/components/section-label";
import type { ComparisonResponse } from "./comparison-response";
import { corpusVersionText, DESIGN_ARMS } from "./design-arms";

type CaseArmFigures = ComparisonResponse["armFigures"][string];
type ArmFigures = CaseArmFigures[ComparisonArm];
type MeasureFigure = ArmFigures["measures"][string];
type ArmCorpusVersions = ComparisonResponse["corpusVersions"][string];
type ArmCorpusVersion = ArmCorpusVersions[ComparisonArm];
type BaselineArm = ComparisonResponse["baselineArm"];

const BORDERS = {
	control: "border-border",
	baseline: "border-strong",
	candidate: "border-deeper",
} as const satisfies Readonly<Record<ComparisonArm, string>>;

function baselineDescription(baselineArm: BaselineArm): string {
	switch (baselineArm.kind) {
		case "derived": {
			return `skill under test removed · ${baselineArm.skillUnderTest}`;
		}
		case "armA": {
			return "arm A run unchanged";
		}
		case "supplied": {
			return "minimal corpus";
		}
		case "unreadable": {
			return baselineArm.reason;
		}
		default: {
			return baselineArm satisfies never;
		}
	}
}

function armDescription(arm: ComparisonArm, baselineArm: BaselineArm): string {
	switch (arm) {
		case "control": {
			return baselineDescription(baselineArm);
		}
		case "baseline": {
			return "before the edit";
		}
		case "candidate": {
			return "after the edit";
		}
		default: {
			return arm satisfies never;
		}
	}
}

function MeasureReading({
	name,
	figure,
	named,
}: {
	readonly name: string;
	readonly figure: MeasureFigure;
	readonly named: boolean;
}): React.JSX.Element {
	const label = named ? `${name} · ` : "";

	if (figure.scale === "successRate") {
		return (
			<div>
				<div className="mt-1.5 font-mono text-20 leading-tight font-bold">
					{`${String(figure.successful)}/${String(figure.attempts)}`}
				</div>
				<div className="mt-0.5 text-11 text-muted-foreground">
					{`${label}${String(figure.successful)} of ${String(figure.attempts)} attempts passed`}
				</div>
			</div>
		);
	}

	if (figure.grades.state === "unavailable") {
		return (
			<div className="mt-1.5 text-11 text-muted-foreground">
				{`${label}grades not recorded: ${figure.grades.reasons.join("; ")}`}
			</div>
		);
	}

	return (
		<div>
			<div className="mt-1.5 font-mono text-20 leading-tight font-bold">
				{figure.grades.median}
			</div>
			<div className="mt-0.5 text-11 text-muted-foreground">
				{`${label}median of ${String(figure.grades.graded)} · range ${figure.grades.lowest} – ${figure.grades.highest}`}
			</div>
		</div>
	);
}

function costAndWords(figures: ArmFigures): string {
	const cost =
		figures.cost.state === "available"
			? `$${figures.cost.totalUsd.toFixed(2)}`
			: `cost not recorded: ${figures.cost.reasons.join("; ")}`;
	const words =
		figures.words.state === "available"
			? `avg ${String(Math.round(figures.words.averageWords))} words`
			: `words not recorded: ${figures.words.reasons.join("; ")}`;

	return `${cost} · ${words}`;
}

function ArmCard({
	role,
	border,
	version,
	description,
	figures,
}: {
	readonly role: string;
	readonly border: string;
	readonly version: ArmCorpusVersion;
	readonly description: string;
	readonly figures: ArmFigures;
}): React.JSX.Element {
	const measures = Object.entries(figures.measures);

	return (
		<article
			aria-label={role}
			className={`rounded-md border bg-raised px-3 py-2.5 ${border}`}
		>
			<div className="flex items-center gap-2">
				<span className="text-10 tracking-widest text-dim uppercase">
					{role}
				</span>
				<span className="ml-auto font-mono text-11 text-pale">
					{corpusVersionText(version)}
				</span>
			</div>
			<div className="mt-1 text-12-5">{description}</div>
			{measures.map(([name, figure]) => (
				<MeasureReading
					key={name}
					name={name}
					figure={figure}
					named={measures.length > 1}
				/>
			))}
			<div className="mt-1 font-mono text-11 text-muted-foreground">
				{costAndWords(figures)}
			</div>
		</article>
	);
}

/** One case's arms side by side, which stays above both presentations. */
export function ArmCardsBand({
	caseId,
	showCase,
	figures,
	corpusVersions,
	baselineArm,
}: {
	readonly caseId: string;
	readonly showCase: boolean;
	readonly figures: CaseArmFigures;
	readonly corpusVersions: ArmCorpusVersions;
	readonly baselineArm: BaselineArm;
}): React.JSX.Element {
	return (
		<section
			aria-label={`Arms · ${caseId}`}
			className="flex flex-col gap-2 border-b border-divider bg-card px-5 py-2.5"
		>
			{showCase ? (
				<SectionLabel>
					<span className="font-mono tracking-normal normal-case">
						{caseId}
					</span>
				</SectionLabel>
			) : null}
			<div className="grid grid-cols-3 gap-3">
				{DESIGN_ARMS.map(({ arm, role }) => (
					<ArmCard
						key={arm}
						role={role.toUpperCase()}
						border={BORDERS[arm]}
						version={corpusVersions[arm]}
						description={armDescription(arm, baselineArm)}
						figures={figures[arm]}
					/>
				))}
			</div>
		</section>
	);
}
