import LAUNCH_ATTEMPTS from "#benchmark/launch-attempts";
import plural from "#client/plural";
import { spendReading } from "#client/run-history/run-progress";
import ActionGroup from "#client/system/components/action-group";
import FilterPill from "#client/system/components/filter-pill";

import { launchBudgetReading } from "./launch-budget";
import { CasePicker, CorpusLine } from "./launch-case-list";
import type { CaseListing, SettledTarget } from "./launch-target-contract";
import type { LaunchFormModel } from "./use-launch-form";

/** What the launch runs, read from the row it was started on. */
interface TargetRowsProps {
	readonly target: SettledTarget;
	readonly cases: readonly CaseListing[];
	readonly caseId: string | undefined;
	readonly onSelectCase: (caseId: string) => void;
}

function TargetRows({
	target,
	cases,
	caseId,
	onSelectCase,
}: TargetRowsProps): React.JSX.Element {
	switch (target.kind) {
		case "case": {
			return (
				<CaseTargetRows
					cases={cases}
					caseId={caseId}
					onSelectCase={onSelectCase}
				/>
			);
		}
		case "replay": {
			return <ReplayTargetRows target={target} />;
		}
		case "comparison": {
			return <ComparisonTargetRows target={target} />;
		}
		case "extension": {
			return <ExtensionTargetRows target={target} />;
		}
		default: {
			return target satisfies never;
		}
	}
}

interface CaseTargetRowsProps {
	readonly cases: readonly CaseListing[];
	readonly caseId: string | undefined;
	readonly onSelectCase: TargetRowsProps["onSelectCase"];
}

function CaseTargetRows({
	cases,
	caseId,
	onSelectCase,
}: CaseTargetRowsProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor="launch-case">Case</label>
			</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<CasePicker cases={cases} selected={caseId} onSelect={onSelectCase} />
			</dd>
			<dt className="text-muted-foreground">Corpus</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<CorpusLine />
			</dd>
		</>
	);
}

interface ReplayTargetRowsProps {
	readonly target: Extract<SettledTarget, { kind: "replay" }>;
}

function ReplayTargetRows({
	target,
}: ReplayTargetRowsProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">Run</dt>
			<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
				{target.run}
			</dd>
			<dt className="text-muted-foreground">Stage</dt>
			<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
				{target.stage}
			</dd>
			<dt className="text-muted-foreground">Corpus</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<CorpusLine />
			</dd>
		</>
	);
}

interface ComparisonTargetRowsProps {
	readonly target: Extract<SettledTarget, { kind: "comparison" }>;
}

function ComparisonTargetRows({
	target,
}: ComparisonTargetRowsProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">Baseline (before)</dt>
			<dd className="sm:col-span-3 min-w-0 font-mono break-all">
				{target.armA}
			</dd>
			<dt className="text-muted-foreground">Candidate (after)</dt>
			<dd className="sm:col-span-3 min-w-0 font-mono break-all">
				{target.armB}
			</dd>
			<dt className="text-muted-foreground">Run</dt>
			<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
				{target.run}
			</dd>
			<dt className="text-muted-foreground">Stage</dt>
			<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
				{target.stage}
			</dd>
			<dt className="text-muted-foreground">Control corpus</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				baseline&apos;s corpus without the one skill that differs
			</dd>
		</>
	);
}

interface ExtensionTargetRowsProps {
	readonly target: Extract<SettledTarget, { kind: "extension" }>;
}

function ExtensionTargetRows({
	target,
}: ExtensionTargetRowsProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">Comparison</dt>
			<dd className="sm:col-span-3 min-w-0 font-mono break-all">
				{target.comparison}
			</dd>
			<dt className="text-muted-foreground">Per arm</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				{plural(target.attempts, "attempt")}
			</dd>
			<dt className="text-muted-foreground">Cost</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				{`about ${spendReading(target.usd)}, at each arm's mean recorded cost per attempt`}
			</dd>
		</>
	);
}

interface LaunchTargetChoicesProps {
	readonly target: SettledTarget;
	readonly targetRows: React.ReactNode;
	readonly model: LaunchFormModel;
}

function LaunchTargetChoices({
	target,
	targetRows,
	model,
}: LaunchTargetChoicesProps): React.JSX.Element {
	return (
		<dl className="grid grid-cols-1 items-center gap-x-3 gap-y-2 text-14 sm:grid-cols-4">
			{targetRows ?? (
				<TargetRows
					target={target}
					cases={model.availableCases}
					caseId={model.caseId}
					onSelectCase={model.setPickedCase}
				/>
			)}
			<dt className="text-muted-foreground">Launch ceiling</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				{launchBudgetReading(model.ceilingUsd, model.settings.isPending)}
			</dd>
			{target.kind === "comparison" || target.kind === "extension" ? null : (
				<LaunchAttemptCount model={model} />
			)}
		</dl>
	);
}

interface LaunchAttemptCountProps {
	readonly model: LaunchFormModel;
}

function LaunchAttemptCount({
	model,
}: LaunchAttemptCountProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">Attempts</dt>
			<dd role="group" aria-label="Attempts" className="min-w-0 sm:col-span-3">
				<ActionGroup>
					{LAUNCH_ATTEMPTS.map((count) => (
						<FilterPill
							key={count}
							pressed={count === model.attempts}
							onPress={() => {
								model.setAttempts(count);
							}}
						>
							{`×${String(count)}`}
						</FilterPill>
					))}
				</ActionGroup>
			</dd>
		</>
	);
}

export { LaunchTargetChoices as default };
