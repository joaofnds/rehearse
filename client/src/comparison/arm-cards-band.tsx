import type { ComparisonArm } from "#benchmark/comparison-record";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { SectionLabel } from "#client/system/components/section-label";
import type { ComparisonResponse } from "./comparison-response";

type CaseArmFigures = ComparisonResponse["armFigures"][string];
type ArmFigures = CaseArmFigures[ComparisonArm];
type MeasureFigure = ArmFigures["measures"][string];
type ArmCorpusVersions = ComparisonResponse["corpusVersions"][string];
type ArmCorpusVersion = ArmCorpusVersions[ComparisonArm];
type BaselineArm = ComparisonResponse["baselineArm"];

/**
 * The design's arm roles: its baseline arm is the harness's control, and its
 * arms A and B are the harness's baseline and candidate.
 */
const CARDS = [
	{ arm: "control", role: "BASELINE", border: "border-border" },
	{ arm: "baseline", role: "ARM A", border: "border-strong" },
	{ arm: "candidate", role: "ARM B", border: "border-deeper" },
] as const satisfies readonly {
	readonly arm: ComparisonArm;
	readonly role: string;
	readonly border: string;
}[];

function baselineDescription(baselineArm: BaselineArm): string {
	if (baselineArm.kind === "supplied") {
		return "minimal corpus";
	}
	if (baselineArm.kind === "unreadable") {
		return baselineArm.reason;
	}

	return baselineArm.kind === "derived"
		? `skill under test removed · ${baselineArm.skillUnderTest}`
		: "arm A run unchanged";
}

function description(arm: ComparisonArm, baselineArm: BaselineArm): string {
	if (arm === "control") {
		return baselineDescription(baselineArm);
	}

	return arm === "baseline" ? "before the edit" : "after the edit";
}

function versionLabel(version: ArmCorpusVersion): string {
	return version.state === "available"
		? corpusVersionLabel(version.digest)
		: version.reasons.join("; ");
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
	summary,
	figures,
}: {
	readonly role: string;
	readonly border: string;
	readonly version: ArmCorpusVersion;
	readonly summary: string;
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
					{versionLabel(version)}
				</span>
			</div>
			<div className="mt-1 text-12-5">{summary}</div>
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
				{CARDS.map(({ arm, role, border }) => (
					<ArmCard
						key={arm}
						role={role}
						border={border}
						version={corpusVersions[arm]}
						summary={description(arm, baselineArm)}
						figures={figures[arm]}
					/>
				))}
			</div>
		</section>
	);
}
