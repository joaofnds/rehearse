import { useId, useState } from "react";

import plural from "#client/plural";
import SectionLabel from "#client/system/components/section-label";
import NativeSelect from "#client/system/ui/native-select";

import { driftReading } from "./calibration-figures";
import type { CalibrationResponse } from "./calibration-query";

const FIRST_CALIBRATION_GROUP_INDEX = 0;

const PREFIX_START_INDEX = 0;

const SINGLE_ITEM_COUNT = 1;
const NO_EXCLUDED_REVIEWS = 0;

type DriftGroup = CalibrationResponse["groups"][number];

const RUBRIC_DIGEST_LENGTH = 12;

function groupLine(group: DriftGroup): string {
	const rubric =
		group.rubricSha256 === null
			? "rubric not recorded"
			: `rubric ${group.rubricSha256.slice(PREFIX_START_INDEX, RUBRIC_DIGEST_LENGTH)}`;

	return [
		group.judgeModel ?? "Judge model not recorded",
		group.stage,
		rubric,
		`contract ${group.judgeContractSha256}`,
		plural(group.reviews, "review"),
	].join(" · ");
}

/**
 * What a group is, apart from how it reads: the line carries the review
 * count, which changes when a grade lands and would lose the choice.
 */
function groupKey(group: DriftGroup): string {
	return JSON.stringify([
		group.judgeModel,
		group.stage,
		group.rubricSha256,
		group.judgeContractSha256,
	]);
}

interface DriftListProps {
	readonly group: DriftGroup;
}

function DriftList({ group }: DriftListProps): React.JSX.Element {
	return (
		<ul className="mt-2 flex flex-col gap-2">
			{group.drift.map(({ dimension, steps }) => {
				const reading = driftReading(steps);

				return (
					<li key={dimension}>
						<div className="flex min-w-0 flex-wrap items-baseline gap-2">
							<span className="min-w-0 flex-1 text-14 wrap-anywhere">
								{dimension}
							</span>
							<span className="font-mono text-12 text-secondary-foreground">
								{reading.value}
							</span>
						</div>
						<div
							aria-hidden="true"
							className="font-mono text-12 tracking-widest text-deep"
						>
							{reading.bar}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * One group at a time, the one with the most operator grades first as the
 * server orders them, since a figure that blends two Judges or two rubrics
 * says how far to trust neither.
 */
interface DriftAsideProps {
	readonly groups: readonly DriftGroup[];
	readonly excludedUnknownJudgeReviews: number;
}

function DriftAside({
	groups,
	excludedUnknownJudgeReviews,
}: DriftAsideProps): React.JSX.Element {
	const headingId = useId();
	const selectId = useId();
	const [chosen, setChosen] = useState<string>();
	const shown =
		groups.find((group) => groupKey(group) === chosen) ??
		groups[FIRST_CALIBRATION_GROUP_INDEX];

	return (
		<aside
			aria-labelledby={headingId}
			className="self-start rounded-lg border border-strong bg-raised px-3.5 py-3"
		>
			<h2 id={headingId}>
				<SectionLabel>Where the judge drifts</SectionLabel>
			</h2>
			{groups.length > SINGLE_ITEM_COUNT && shown !== undefined ? (
				<JudgeGroupChoice
					selectId={selectId}
					shown={shown}
					groups={groups}
					setChosen={setChosen}
				/>
			) : null}
			{shown === undefined ? null : (
				<section className="mt-2">
					<p className="text-12 text-dim wrap-anywhere">{groupLine(shown)}</p>
					<DriftList group={shown} />
				</section>
			)}
			{excludedUnknownJudgeReviews > NO_EXCLUDED_REVIEWS ? (
				<p className="mt-3 text-14 text-muted-foreground">
					{plural(excludedUnknownJudgeReviews, "review")} excluded from drift
					because Judge instruction identity was not recorded. Individual
					reviews remain available.
				</p>
			) : null}
			<p className="mt-3 text-14 text-pretty text-muted-foreground">
				Calibration does not change a grade. It tells you how much to trust one.
			</p>
		</aside>
	);
}

interface JudgeGroupChoiceProps {
	readonly selectId: string;
	readonly shown: DriftGroup;
	readonly groups: readonly DriftGroup[];
	readonly setChosen: (chosen: string) => void;
}

function JudgeGroupChoice({
	selectId,
	shown,
	groups,
	setChosen,
}: JudgeGroupChoiceProps): React.JSX.Element {
	return (
		<div className="mt-2 flex flex-col gap-1">
			<label htmlFor={selectId} className="text-12 text-dim">
				Judge group
			</label>
			<NativeSelect
				id={selectId}
				value={groupKey(shown)}
				onChange={(event) => {
					setChosen(event.target.value);
				}}
			>
				{groups.map((group) => (
					<option key={groupKey(group)} value={groupKey(group)}>
						{groupLine(group)}
					</option>
				))}
			</NativeSelect>
		</div>
	);
}

export { DriftAside as default };
