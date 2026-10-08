import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	corpusVersionHash,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
} from "#client/launch/spend-ceiling-entry";
import { plural } from "#client/plural";
import { cn } from "#client/system/cn";
import { FilterPill } from "#client/system/components/filter-pill";
import { Button } from "#client/system/ui/button";
import { linkSetupCorpus } from "./setup-requests";

const LIMIT_PRESETS = ["5.00", "20.00", "50.00"] as const;

/** The prototype's opening amount, one of the presets. */
const OPENING_LIMIT = "20.00";

const MISSING_HINT = "Set a limit, then scan a corpus directory.";

/** Worded so it claims nothing stored before Finish writes the limit. */
const READY_HINT = "A corpus is linked. Finish setup records the spend limit.";

type StepLook = "open" | "dimmed" | "locked";

function SetupStep({
	number,
	title,
	state,
	look,
	children,
}: {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly look: StepLook;
	readonly children: ReactNode;
}): React.JSX.Element {
	const locked = look === "locked";

	return (
		<li
			className={cn(
				"rounded-card border px-5.5 py-5",
				look === "open" && "border-strong bg-raised",
				look === "dimmed" && "border-divider bg-raised opacity-55",
				locked && "border-dashed border-strong opacity-50",
			)}
		>
			<div className="flex items-center gap-2.5">
				<span
					aria-hidden="true"
					className={cn(
						"grid size-6 flex-none place-items-center rounded-full border font-mono text-11",
						locked
							? "border-stronger text-muted-foreground"
							: "border-deeper text-pale",
					)}
				>
					{number}
				</span>
				<h2 className="text-14">{title}</h2>
				<span className="ml-auto text-10 tracking-label text-dim uppercase">
					{state}
				</span>
			</div>
			{children}
		</li>
	);
}

function StepProse({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<p className="mt-2.5 max-w-intro text-12-5 text-muted-foreground">
			{children}
		</p>
	);
}

/**
 * What a fresh install shows on every screen: a spend limit, then a corpus,
 * then the case they make possible (SPEC.md section 11).
 */
function SpendLimitControls({
	limit,
	onLimit,
}: {
	readonly limit: string;
	readonly onLimit: (limit: string) => void;
}): React.JSX.Element {
	return (
		<div className="mt-3.5 flex flex-wrap items-center gap-2.5">
			<label className="flex items-center gap-2 rounded-md border border-strong bg-background px-2.5 py-2">
				<span className="text-11 text-muted-foreground">USD</span>
				<input
					value={limit}
					inputMode="decimal"
					aria-label="Spend limit in US dollars"
					onChange={(event) => {
						onLimit(event.target.value);
					}}
					className="w-22 bg-transparent font-mono text-13 outline-none"
				/>
			</label>
			{LIMIT_PRESETS.map((preset) => (
				<FilterPill
					key={preset}
					pressed={limit === preset}
					onPress={() => {
						onLimit(preset);
					}}
				>
					{`$${preset}`}
				</FilterPill>
			))}
		</div>
	);
}

/** A scan links a corpus Rehearse can version: a digest and no refusal. */
function isSatisfied(report: CorpusResponse | undefined): boolean {
	return (
		report !== undefined &&
		report.digest !== undefined &&
		report.refusals.length === 0
	);
}

function ScannedFiles({
	report,
}: {
	readonly report: CorpusResponse;
}): React.JSX.Element {
	return (
		<div className="mt-3.5 overflow-hidden rounded-md border border-border">
			<div className="bg-subtle px-3 py-2 text-10 tracking-label text-muted-foreground uppercase">
				{report.digest === undefined
					? `Found ${plural(report.files.length, "file")} · not hashed`
					: `Found ${plural(report.files.length, "file")} · hashed as ${corpusVersionLabel(report.digest)}`}
			</div>
			<ul aria-label="Scanned corpus files">
				{report.files.map((file) => (
					<li
						key={file.path}
						className="flex gap-3 border-t border-subtle px-3 py-1.5 font-mono text-11-5"
					>
						<span className="flex-1 break-all">{file.path}</span>
						<span className="text-dim">{`sha ${corpusVersionHash(file.sha256)}`}</span>
						<span className="w-17 text-right text-dim">{`${String(file.lines)} ln`}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function CorpusControls({
	livePlaceholder,
	directory,
	onDirectory,
	onScan,
	scanning,
	refusal,
	report,
}: {
	readonly livePlaceholder: string;
	readonly directory: string;
	readonly onDirectory: (directory: string) => void;
	readonly onScan: () => void;
	readonly scanning: boolean;
	readonly refusal: string | undefined;
	readonly report: CorpusResponse | undefined;
}): React.JSX.Element {
	return (
		<>
			<form
				className="mt-3.5 flex gap-2.5"
				onSubmit={(event) => {
					event.preventDefault();
					onScan();
				}}
			>
				<input
					value={directory}
					placeholder={livePlaceholder}
					aria-label="Corpus directory"
					onChange={(event) => {
						onDirectory(event.target.value);
					}}
					className="h-9 min-w-0 flex-1 rounded-md border border-strong bg-background px-3 font-mono text-12 outline-none"
				/>
				<Button type="submit" disabled={scanning}>
					Scan
				</Button>
			</form>
			{refusal === undefined ? null : (
				<p role="alert" className="mt-2 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{refusal}
				</p>
			)}
			{report === undefined ? null : <ScannedFiles report={report} />}
			{report?.refusals.map((reason) => (
				<p key={reason} className="mt-2 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{reason}
				</p>
			))}
		</>
	);
}

function corpusState(linked: boolean, limitSet: boolean): string {
	if (linked) {
		return "Linked";
	}

	return limitSet ? "Required" : "Set a limit first";
}

export function SetupPage(): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);
	const queryClient = useQueryClient();
	const [limit, setLimit] = useState<string>(OPENING_LIMIT);
	const [directory, setDirectory] = useState("");
	const [livePlaceholder] = useState(() =>
		settings.data?.linkedCorpus.kind === "live"
			? settings.data.linkedCorpus.root
			: "the live install",
	);
	const scan = useMutation({
		mutationFn: async (scanned: string): Promise<CorpusResponse> => {
			queryClient.setQueryData(
				launchSettingsQuery.queryKey,
				await linkSetupCorpus(scanned),
			);

			return queryClient.query({ ...corpusQuery, staleTime: 0 });
		},
	});
	const navigate = useNavigate();
	const finish = useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: async (reading) => {
			await navigate({ to: "/" });
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
		},
	});
	const usd = enteredCeilingUsd(limit);
	const limitSet = usd !== undefined;
	const linked = isSatisfied(scan.data);

	return (
		<div className="flex justify-center px-10 py-17">
			<div className="w-full max-w-191">
				<h1 className="text-22 tracking-tight">Nothing is measured yet</h1>
				<p className="mt-2.5 max-w-intro text-muted-foreground">
					Rehearse needs two things before a case can be declared: a hard
					ceiling on what a run may spend, and the instruction corpus whose
					effect it is measuring. A case is meaningless without a corpus to
					attribute results to.
				</p>

				<ol aria-label="Setup steps" className="mt-8.5 flex flex-col gap-3.5">
					<SetupStep
						number={1}
						title="Set a spend limit"
						state="Required"
						look="open"
					>
						<StepProse>
							Applies per run and per group. Rehearse refuses to start a run
							without one, and stops mid-step when the ceiling is reached.
						</StepProse>
						<SpendLimitControls limit={limit} onLimit={setLimit} />
					</SetupStep>
					<SetupStep
						number={2}
						title="Point at an instruction corpus"
						state={corpusState(linked, limitSet)}
						look={linked || limitSet ? "open" : "dimmed"}
					>
						<StepProse>
							A directory of instruction files: the project instruction file,
							skills, rubrics. Rehearse hashes each file on every run so a
							result always names the version that produced it.
						</StepProse>
						<CorpusControls
							livePlaceholder={livePlaceholder}
							directory={directory}
							onDirectory={setDirectory}
							onScan={() => {
								scan.mutate(directory);
							}}
							scanning={scan.isPending}
							refusal={scan.isError ? scan.error.message : undefined}
							report={scan.data}
						/>
					</SetupStep>
					<SetupStep
						number={3}
						title="Declare your first case"
						state="Locked"
						look="locked"
					>
						<StepProse>
							Unlocks once a corpus is linked. Two kinds: a multi-step task
							against a target repository, or a single agent session judged by
							deterministic checks.
						</StepProse>
					</SetupStep>
				</ol>

				<div className="mt-5 flex items-center gap-3">
					<Button
						disabled={usd === undefined || !linked || finish.isPending}
						onClick={() => {
							if (usd !== undefined) {
								finish.mutate(usd);
							}
						}}
					>
						Finish setup
					</Button>
					<span className="text-11-5 text-dim">
						{usd !== undefined && linked ? READY_HINT : MISSING_HINT}
					</span>
				</div>
				{finish.isError ? (
					<p role="alert" className="mt-2 text-12 text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{`The spend limit was not stored: ${finish.error.message}`}
					</p>
				) : null}
				{settings.isError ? (
					<p role="alert" className="mt-2 text-12 text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{`Could not read the stored settings: ${settings.error.message}`}
					</p>
				) : null}
			</div>
		</div>
	);
}
