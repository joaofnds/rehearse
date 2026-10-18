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
import {
	launchSettingsQuery,
	SettingsRefusedError,
} from "#client/launch/settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
} from "#client/launch/spend-ceiling-entry";
import { plural } from "#client/plural";
import { DeclareCaseDialog } from "#client/cases/declare-case-dialog";
import { cn } from "#client/system/cn";
import { AmountInput } from "#client/system/components/amount-input";
import { ActionGroup } from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";
import { linkSetupCorpus } from "./setup-requests";

const LIMIT_PRESETS = ["5.00", "20.00", "50.00"] as const;

const NOTHING_HINT = "Choose a spend limit and scan a corpus directory.";

const NO_LIMIT_HINT = "Set a spend limit.";

const NO_CORPUS_HINT = "Scan a corpus directory.";

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
				"min-w-0 rounded-card border p-5 sm:p-6",
				look === "open" && "border-strong bg-raised",
				look === "dimmed" && "border-divider bg-raised",
				locked && "border-dashed border-strong",
			)}
		>
			<div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-6 sm:items-center">
				<div className="flex min-w-0 items-center gap-2.5 sm:col-span-4">
					<span
						aria-hidden="true"
						className={cn(
							"grid size-6 flex-none place-items-center rounded-full border font-mono text-12",
							locked
								? "border-stronger text-muted-foreground"
								: "border-deeper text-pale",
						)}
					>
						{number}
					</span>
					<h2 className="min-w-0 text-16 font-semibold wrap-anywhere">
						{title}
					</h2>
				</div>
				<span className="text-12 tracking-label text-dim uppercase sm:col-span-2 sm:text-right">
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
		<p className="mt-2.5 max-w-intro text-14 leading-reading text-muted-foreground">
			{children}
		</p>
	);
}

function LimitPreset({
	preset,
	pressed,
	onPress,
}: {
	readonly preset: string;
	readonly pressed: boolean;
	readonly onPress: () => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onPress}
			className="min-h-touch-target min-w-touch-target rounded-md border border-strong px-2.5 py-1.5 font-mono text-14 text-secondary-foreground transition-colors hover:border-primary hover:bg-accent aria-pressed:border-primary aria-pressed:text-pale"
		>
			{`$${preset}`}
		</button>
	);
}

function SpendLimitControls({
	limit,
	onLimit,
}: {
	readonly limit: string;
	readonly onLimit: (limit: string) => void;
}): React.JSX.Element {
	return (
		<div className="mt-3.5 flex flex-wrap items-center gap-2.5">
			<AmountInput
				value={limit}
				accessibleName="Spend limit in US dollars"
				onChange={onLimit}
			/>
			{LIMIT_PRESETS.map((preset) => (
				<LimitPreset
					key={preset}
					preset={preset}
					pressed={limit === preset}
					onPress={() => {
						onLimit(preset);
					}}
				/>
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
			<div className="bg-subtle px-3 py-2 text-12 tracking-label text-muted-foreground uppercase">
				{report.digest === undefined
					? `Found ${plural(report.files.length, "file")} · not hashed`
					: `Found ${plural(report.files.length, "file")} · hashed as ${corpusVersionLabel(report.digest)}`}
			</div>
			<ul aria-label="Scanned corpus files">
				{report.files.map((file) => (
					<li
						key={file.path}
						className="flex min-w-0 flex-col gap-1 border-t border-subtle px-3 py-2 font-mono text-12 sm:flex-row sm:gap-3"
					>
						<span className="min-w-0 flex-1 wrap-anywhere">{file.path}</span>
						<span className="flex flex-wrap gap-x-3 gap-y-1">
							<span className="text-dim">{`sha ${corpusVersionHash(file.sha256)}`}</span>
							<span className="text-dim">{`${String(file.lines)} ln`}</span>
						</span>
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
					className="min-h-touch-target min-w-0 flex-1 rounded-md border border-strong bg-background px-3 font-mono text-14"
				/>
				<Button variant="primary" type="submit" disabled={scanning}>
					Scan
				</Button>
			</form>
			{refusal === undefined ? null : (
				<p role="alert" className="mt-2 text-12 text-attention wrap-anywhere">
					<span aria-hidden="true">⚠ </span>
					{refusal}
				</p>
			)}
			{report === undefined ? null : <ScannedFiles report={report} />}
			{report?.refusals.map((reason) => (
				<p
					key={reason}
					className="mt-2 text-12 text-secondary-foreground wrap-anywhere"
				>
					<span aria-hidden="true">⚠ </span>
					{reason}
				</p>
			))}
		</>
	);
}

/** What Finish setup still waits on, or that it waits on nothing. */
function finishHint(limitEntered: boolean, linked: boolean): string {
	if (!limitEntered) {
		return linked ? NO_LIMIT_HINT : NOTHING_HINT;
	}

	return linked ? READY_HINT : NO_CORPUS_HINT;
}

function corpusState(linked: boolean): string {
	if (linked) {
		return "Linked";
	}

	return "Required";
}

export function SetupPage(): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);
	const queryClient = useQueryClient();
	const [limit, setLimit] = useState("");
	const [directory, setDirectory] = useState("");
	const [scanned, setScanned] = useState<CorpusResponse>();
	const [declaredPath, setDeclaredPath] = useState<string>();
	const scan = useMutation({
		mutationFn: async (path: string): Promise<CorpusResponse> => {
			const reading = await linkSetupCorpus(path);
			await queryClient.cancelQueries(launchSettingsQuery);
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
			// A read already in flight began before the link changed.
			await queryClient.cancelQueries(corpusQuery);

			return queryClient.query({ ...corpusQuery, staleTime: 0 });
		},
		onSuccess: setScanned,
		onError: (error) => {
			// A refused link leaves the earlier one stored, still listed.
			if (!(error instanceof SettingsRefusedError)) {
				setScanned(undefined);
			}
		},
	});
	const navigate = useNavigate();
	const finish = useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: async (reading) => {
			await queryClient.cancelQueries(launchSettingsQuery);
			await navigate({ to: "/" });
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
		},
	});
	const usd = enteredCeilingUsd(limit);
	const limitEntered = usd !== undefined;
	const linked = isSatisfied(scanned);

	return (
		<div className="flex min-w-0 justify-center page-gutter py-8 sm:py-17">
			<div className="min-w-0 w-full max-w-191">
				<h1 className="text-24 tracking-tight leading-heading">
					Nothing is measured yet
				</h1>
				<p className="mt-2.5 max-w-intro text-muted-foreground">
					Scan an instruction corpus to unlock case declaration. Choose a spend
					limit before starting runs. Finish setup stores that limit once the
					corpus is linked.
				</p>

				<ol aria-label="Setup steps" className="mt-8.5 flex flex-col gap-3.5">
					<SetupStep
						number={1}
						title="Set a spend limit"
						state={limitEntered ? "Set" : "Required"}
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
						state={corpusState(linked)}
						look={linked || limitEntered ? "open" : "dimmed"}
					>
						<StepProse>
							A directory of instruction files: the project instruction file,
							skills, rubrics. Rehearse hashes each file on every run so a
							result always names the version that produced it.
						</StepProse>
						<CorpusControls
							livePlaceholder={settings.data?.liveCorpusRoot ?? ""}
							directory={directory}
							onDirectory={setDirectory}
							onScan={() => {
								scan.mutate(directory);
							}}
							scanning={scan.isPending || finish.isPending}
							refusal={scan.isError ? scan.error.message : undefined}
							report={scanned}
						/>
					</SetupStep>
					<SetupStep
						number={3}
						title="Declare your first case"
						state={linked ? "Open" : "Locked"}
						look={linked ? "open" : "locked"}
					>
						<StepProse>
							{linked ? "" : "Unlocks once a corpus is linked. "}Two kinds: a
							multi-step task against a target repository, or a single agent
							session judged by deterministic checks.
						</StepProse>
						{linked ? (
							<div className="mt-3 flex flex-col items-start gap-2">
								<DeclareCaseDialog onDeclared={setDeclaredPath} />
								{declaredPath === undefined ? null : (
									<p
										role="status"
										className="text-12 text-muted-foreground wrap-anywhere"
									>
										{`Declared ${declaredPath}. It is uncommitted: review and commit it to keep the case.`}
									</p>
								)}
							</div>
						) : null}
					</SetupStep>
				</ol>

				<ActionGroup className="mt-5">
					<Button
						variant="primary"
						disabled={!limitEntered || !linked || finish.isPending}
						onClick={() => {
							if (usd !== undefined) {
								finish.mutate(usd);
							}
						}}
					>
						Finish setup
					</Button>
					<span className="text-12 text-dim">
						{finishHint(limitEntered, linked)}
					</span>
				</ActionGroup>
				{finish.isError ? (
					<p role="alert" className="mt-2 text-12 text-attention wrap-anywhere">
						<span aria-hidden="true">⚠ </span>
						{`The spend limit was not stored: ${finish.error.message}`}
					</p>
				) : null}
				{settings.isError ? (
					<p role="alert" className="mt-2 text-12 text-attention wrap-anywhere">
						<span aria-hidden="true">⚠ </span>
						{`Could not read the stored settings: ${settings.error.message}`}
					</p>
				) : null}
			</div>
		</div>
	);
}
