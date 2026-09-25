import { useQuery } from "@tanstack/react-query";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { EmptyState } from "#client/system/components/empty-state";
import { PlannedFeatureBlock } from "#client/system/components/planned-feature-block";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import type { CorpusResponse } from "./corpus-query";
import { corpusQuery } from "./corpus-query";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { Notice } from "#client/system/components/notice";

type CorpusFile = CorpusResponse["files"][number];

const COLUMNS = ["Path", "Hash", "Last edited", "Read by"] as const;

function rowFor(file: CorpusFile): readonly React.ReactNode[] {
	return [
		<span key="path" className="font-mono text-sm">
			{file.path}
		</span>,
		<span key="hash" className="font-mono text-sm text-muted-foreground">
			{file.sha256.slice(0, 12)}
		</span>,
		<span key="edited" className="text-sm text-secondary-foreground">
			{new Date(file.lastEditedAt).toLocaleString()}
		</span>,
		<span key="read-by" className="font-mono text-sm">
			{file.readBy}
		</span>,
	];
}

export function CorpusPage(): React.JSX.Element {
	const query = useQuery(corpusQuery);

	return (
		<div>
			<ScreenHeader
				title="Instruction corpus"
				subline={
					query.isSuccess ? (
						<>
							<span className="font-mono">{query.data.root}</span>
							{` · ${plural(query.data.files.length, "file")}`}
							{query.data.digest === undefined ? null : (
								<>
									{" · current version "}
									<span className="font-mono text-pale">
										{corpusVersionLabel(query.data.digest)}
									</span>
								</>
							)}
						</>
					) : undefined
				}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load the corpus.
					</p>
				) : null}

				{query.isSuccess && query.data.refusals.length > 0 ? (
					<Notice
						message="These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:"
						items={query.data.refusals}
					/>
				) : null}

				{query.isSuccess &&
				query.data.files.length === 0 &&
				query.data.refusals.length === 0 ? (
					<EmptyState heading="No corpus files found">
						<p>
							The corpus root holds no files in corpus layout. Add a CLAUDE.md,
							a skill, an output style, or an agent definition under it, then
							reload this screen.
						</p>
					</EmptyState>
				) : null}

				{query.isSuccess && query.data.files.length > 0 ? (
					<TableShell
						caption="Corpus files"
						columns={[...COLUMNS]}
						numeric={["Read by"]}
						rows={query.data.files.map((file) => rowFor(file))}
					/>
				) : null}

				<PlannedFeatureBlock heading="Edit an instruction, review, then apply">
					<h3>
						<SectionLabel>Review before apply</SectionLabel>
					</h3>
					<ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
						<li>Writes a new corpus version, keeps the old one addressable</li>
						<li>
							Marks the recorded results it invalidates stale, none deleted
						</li>
						<li>Offers the paired rerun that would settle it</li>
					</ul>
					<div className="mt-3 flex gap-2">
						<Button size="sm" disabled>
							Apply
						</Button>
						<Button size="sm" variant="outline" disabled>
							Discard
						</Button>
					</div>
				</PlannedFeatureBlock>
			</div>
		</div>
	);
}
