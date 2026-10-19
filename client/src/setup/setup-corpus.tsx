import {
	corpusVersionHash,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import plural from "#client/plural";
import { Button } from "#client/system/ui/button";

import { SetupStep, StepProse } from "./setup-step";

const EMPTY_COLLECTION_LENGTH = 0;

/** A scan links a corpus Rehearse can version: a digest and no refusal. */
function isSatisfied(report: CorpusResponse | undefined): boolean {
	return (
		report?.digest !== undefined &&
		report.refusals.length === EMPTY_COLLECTION_LENGTH
	);
}

interface ScannedFilesProps {
	readonly report: CorpusResponse;
}

function ScannedFiles({ report }: ScannedFilesProps): React.JSX.Element {
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

interface CorpusControlsProps {
	readonly livePlaceholder: string;
	readonly directory: string;
	readonly onDirectory: (directory: string) => void;
	readonly onScan: () => void;
	readonly scanning: boolean;
	readonly refusal: string | undefined;
	readonly report: CorpusResponse | undefined;
}

function CorpusControls({
	livePlaceholder,
	directory,
	onDirectory,
	onScan,
	scanning,
	refusal,
	report,
}: CorpusControlsProps): React.JSX.Element {
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

function corpusState(linked: boolean): string {
	if (linked) {
		return "Linked";
	}

	return "Required";
}

interface SetupCorpusStepProps {
	readonly linked: boolean;
	readonly limitEntered: boolean;
	readonly livePlaceholder: string;
	readonly directory: string;
	readonly setDirectory: (directory: string) => void;
	readonly onScan: () => void;
	readonly scanning: boolean;
	readonly refusal: string | undefined;
	readonly scanned: CorpusResponse | undefined;
}

function SetupCorpusStep({
	linked,
	limitEntered,
	livePlaceholder,
	directory,
	setDirectory,
	onScan,
	scanning,
	refusal,
	scanned,
}: SetupCorpusStepProps): React.JSX.Element {
	return (
		<SetupStep
			number={2}
			title="Point at an instruction corpus"
			state={corpusState(linked)}
			look={linked || limitEntered ? "open" : "dimmed"}
		>
			<StepProse>
				A directory of instruction files: the project instruction file, skills,
				rubrics. Rehearse hashes each file on every run so a result always names
				the version that produced it.
			</StepProse>
			<CorpusControls
				livePlaceholder={livePlaceholder}
				directory={directory}
				onDirectory={setDirectory}
				onScan={onScan}
				scanning={scanning}
				refusal={refusal}
				report={scanned}
			/>
		</SetupStep>
	);
}

export { isSatisfied, SetupCorpusStep };
