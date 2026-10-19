import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import comparisonIndexQuery from "#client/comparison/comparison-index-query";
import SummaryPanel from "#client/system/components/summary-panel";

import type { ListedCase } from "./case-card";
import { CaseCohorts, EMPTY_COLLECTION_LENGTH } from "./case-cohorts";
import { CaseDefinition, DefinitionReading } from "./case-definition";

const PREFIX_START_INDEX = 0;

const COMPARISON_DIGEST_PREVIEW_CHARACTERS = 12;

interface RelatedComparisonsProps {
	readonly caseId: string;
}

function RelatedComparisons({
	caseId,
}: RelatedComparisonsProps): React.JSX.Element {
	const query = useQuery(comparisonIndexQuery);
	const related = (query.data?.comparisons ?? []).filter((entry) =>
		entry.caseIds.includes(caseId),
	);
	return (
		<SummaryPanel
			title="Related comparisons"
			description="Saved comparisons keep their own corpus pair and conditions. They are not combined with this cohort."
		>
			{query.isLoading ? (
				<p className="text-14 text-muted-foreground">Loading comparisons…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="text-14 text-attention">
					Comparisons could not be loaded.
				</p>
			) : null}
			{query.isSuccess && related.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					No saved comparison names this case.
				</p>
			) : null}
			<ul className="flex flex-col gap-3">
				{related.map((entry) => (
					<li key={entry.digest}>
						<Link
							to="/comparisons/$digest"
							params={{ digest: entry.digest }}
							className="text-14 text-link hover:underline"
						>
							{caseId} · {entry.mode} comparison{" "}
							<span className="font-mono text-12">
								{entry.digest.slice(
									PREFIX_START_INDEX,
									COMPARISON_DIGEST_PREVIEW_CHARACTERS,
								)}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</SummaryPanel>
	);
}

interface CaseDetailProps {
	readonly listed: ListedCase;
	readonly corpusVersion: string | undefined;
}

function CaseDetail({
	listed,
	corpusVersion,
}: CaseDetailProps): React.JSX.Element {
	const { definition } = listed;
	return (
		<div className="flex flex-col gap-6">
			<CaseDefinition listed={listed} definition={definition} />
			<div className="grid min-w-0 gap-6 xl:grid-cols-2">
				<SummaryPanel
					title={listed.kind === "session" ? "Prompt" : "Task prompt"}
				>
					<DefinitionReading reading={definition?.prompt} />
				</SummaryPanel>
				<SummaryPanel
					title="Evaluation contract"
					description={
						listed.kind === "session"
							? "Reply/transcript checks and the saved-state check are separate assessment layers."
							: "Final rubric; step rubrics are listed in the workflow definition."
					}
				>
					<DefinitionReading
						reading={definition?.evaluation}
						code={listed.kind === "session"}
					/>
				</SummaryPanel>
			</div>
			{definition?.productBrief === undefined ? null : (
				<SummaryPanel title="Product brief">
					<DefinitionReading reading={definition.productBrief} />
				</SummaryPanel>
			)}
			<CaseCohorts listed={listed} corpusVersion={corpusVersion} />
			<RelatedComparisons caseId={listed.id} />
		</div>
	);
}

export { CaseDetail as default };
