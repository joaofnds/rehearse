import { spendReading } from "#client/run-history/run-progress";
import Disclosure from "#client/system/components/disclosure";
import Metric from "#client/system/components/metric";
import RecordedText from "#client/system/components/recorded-text";
import SummaryPanel from "#client/system/components/summary-panel";

import type { ListedCase } from "./case-card";
import { EMPTY_COLLECTION_LENGTH } from "./case-cohorts";

type Definition = NonNullable<ListedCase["definition"]>;

type TextReading = Definition["prompt"];

interface DefinitionReadingProps {
	readonly reading: TextReading | undefined;
	readonly code?: boolean;
}

function DefinitionReading({
	reading,
	code = false,
}: DefinitionReadingProps): React.JSX.Element {
	if (reading === undefined) {
		return (
			<p className="text-14 text-muted-foreground">
				Definition content is unavailable from this listing.
			</p>
		);
	}
	return (
		<>
			<p className="mb-3 font-mono text-12 text-dim">{reading.source}</p>
			{reading.state === "available" ? (
				<div className="max-h-120 overflow-auto">
					{code ? (
						<pre className="whitespace-pre-wrap break-words font-mono leading-transcript text-13">
							{reading.text}
						</pre>
					) : (
						<RecordedText text={reading.text} />
					)}
				</div>
			) : (
				<p className="text-14 text-muted-foreground">{reading.reason}</p>
			)}
		</>
	);
}

interface CaseDefinitionProps {
	readonly listed: ListedCase;
	readonly definition: ListedCase["definition"];
}

function CaseDefinition({
	listed,
	definition,
}: CaseDefinitionProps): React.JSX.Element {
	return (
		<SummaryPanel
			title="Case definition"
			description={
				listed.kind === "session"
					? "A session case supplies one prompt and evaluates the reply, transcript and any declared saved-state checks."
					: "A workflow case supplies a task and product brief, then evaluates its steps and final output."
			}
		>
			<dl className="grid gap-5 sm:grid-cols-3">
				<Metric label="Model" value={listed.model ?? "Not declared"} />
				<Metric
					label="Session budget"
					value={
						definition?.sessionBudgetUsd === undefined ||
						definition.sessionBudgetUsd === null
							? "Not declared"
							: spendReading(definition.sessionBudgetUsd)
					}
					hint="Per session; the launch ceiling applies separately."
				/>
				<Metric
					label="Definition"
					value={
						<span className="font-mono text-12">
							cases/{listed.id}/case.json
						</span>
					}
				/>
			</dl>
			{definition?.corpusFiles === undefined ? null : (
				<DeclaredCorpusFiles files={definition.corpusFiles} />
			)}
			{definition?.tools === undefined ? null : (
				<p className="mt-2 text-14 text-muted-foreground">
					Allowed tools:{" "}
					{definition.tools.length === EMPTY_COLLECTION_LENGTH
						? "None"
						: definition.tools.join(", ")}
				</p>
			)}
		</SummaryPanel>
	);
}

interface DeclaredCorpusFilesProps {
	readonly files: readonly string[];
}

function DeclaredCorpusFiles({
	files,
}: DeclaredCorpusFilesProps): React.JSX.Element {
	return (
		<div className="mt-4">
			<Disclosure
				collapsedLabel={`Declared corpus files (${String(files.length)})`}
				expandedLabel="Hide declared corpus files"
			>
				{files.length === EMPTY_COLLECTION_LENGTH ? (
					<p className="text-14 text-muted-foreground">
						No corpus files declared.
					</p>
				) : (
					<ul
						aria-label="Declared corpus files"
						className="mt-2 max-h-80 w-full overflow-auto font-mono text-12"
					>
						{files.map((path) => (
							<li key={path} className="py-1 wrap-anywhere">
								{path}
							</li>
						))}
					</ul>
				)}
			</Disclosure>
			<p className="mt-2 text-12 text-muted-foreground">
				Declared inclusion does not prove an instruction was read.
			</p>
		</div>
	);
}

export { CaseDefinition, DefinitionReading };
