import { Link } from "@tanstack/react-router";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { ComparisonResponse } from "./comparison-response";
import { corpusVersionText, DESIGN_ARMS } from "./design-arms";

type CaseArmFigures = ComparisonResponse["armFigures"][string];
type ArmFigures = CaseArmFigures[ComparisonArm];
type MeasureFigure = ArmFigures["measures"][string];
type ArmCorpusVersions = ComparisonResponse["corpusVersions"][string];
type ArmCorpusVersion = ArmCorpusVersions[ComparisonArm];
type BaselineArm = ComparisonResponse["baselineArm"];
type CaseHistories = ComparisonResponse["attemptHistories"][string];

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
			return "baseline (before) run unchanged";
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
	let label = named ? `${name} · ` : "";
	if (name === "checks") {
		label = "recorded check outcome · ";
	}

	if (figure.scale === "successRate") {
		return (
			<div>
				<div className="mt-1.5 font-mono text-20 leading-tight font-bold">
					{`${String(figure.successful)}/${String(figure.attempts)}`}
				</div>
				<div className="mt-0.5 text-12 text-muted-foreground">
					{`${label}${String(figure.successful)} of ${String(figure.attempts)} attempts passed`}
				</div>
			</div>
		);
	}

	if (figure.grades.state === "unavailable") {
		return (
			<div className="mt-1.5 text-12 text-muted-foreground">
				{`${label}grades not recorded: ${figure.grades.reasons.join("; ")}`}
			</div>
		);
	}

	return (
		<div>
			<div className="mt-1.5 font-mono text-20 leading-tight font-bold">
				{figure.grades.median}
			</div>
			<div className="mt-0.5 text-12 text-muted-foreground">
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

function groupDestinations(
	histories: CaseHistories[ComparisonArm],
): readonly string[] {
	const groups = histories.flatMap((history) => {
		if (history.status !== "available") {
			return [];
		}
		return [history.groupId];
	});
	return [...new Set(groups)];
}

function ArmCard({
	digest,
	groups,
	role,
	border,
	version,
	description,
	figures,
}: {
	readonly digest: string;
	readonly groups: readonly string[];
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
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<span className="text-12 tracking-widest text-muted-foreground uppercase">
					{role}
				</span>
				<span className="ml-auto font-mono text-12 text-pale">
					{corpusVersionText(version)}
				</span>
			</div>
			<div className="mt-1 text-12">{description}</div>
			{measures.map(([name, figure]) => (
				<MeasureReading
					key={name}
					name={name}
					figure={figure}
					named={measures.length > 1}
				/>
			))}
			<div className="mt-1 font-mono text-12 text-muted-foreground">
				{costAndWords(figures)}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
				{groups.map((group, index) => (
					<Link
						key={group}
						to="/groups/$groupId"
						params={{ groupId: group }}
						search={{ view: "attempts", comparison: digest }}
						className="text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
					>
						{groups.length === 1 ? "Open group" : `Open group ${index + 1}`}
					</Link>
				))}
			</div>
		</article>
	);
}

/** Each arm's corpus and recorded figures, beside its source groups. */
export function ArmCardsBand({
	digest,
	histories,
	caseId,
	showCase,
	figures,
	corpusVersions,
	baselineArm,
}: {
	readonly digest: string;
	readonly histories: CaseHistories | undefined;
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
				<span className="text-12 text-muted-foreground">
					<span className="font-mono tracking-normal normal-case">
						{caseId}
					</span>
				</span>
			) : null}
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
				{DESIGN_ARMS.map(({ arm, role }) => (
					<ArmCard
						key={arm}
						digest={digest}
						groups={groupDestinations(histories?.[arm] ?? [])}
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
