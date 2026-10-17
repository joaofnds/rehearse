import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { recordedInstant } from "#benchmark/recorded-instant";
import { casesQuery } from "#client/cases/cases-query";
import { comparisonIndexQuery } from "#client/comparison/comparison-index-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import {
	matchesText,
	recordIdentity,
	recordSearchTexts,
} from "#client/run-history/run-discovery";
import { runListingQuery } from "#client/run-history/run-history-query";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { withinCase } from "#client/within-case";
import { Switcher } from "#client/system/components/switcher";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

type Row = RunListingResponse["rows"][number];
const RECORD_LABELS = {
	run: "Run",
	"session-attempt": "Session attempt",
	replay: "Replay",
	group: "Group",
} as const satisfies Readonly<Record<Row["kind"], string>>;
interface SearchResult {
	readonly collection: SearchCollection;
	readonly kind: string;
	readonly label: string;
	readonly detail: string;
	readonly href: string;
}

const COLLECTIONS = [
	"All",
	"Cases",
	"Instructions",
	"Comparisons",
	"Runs",
] as const;
type SearchScope = (typeof COLLECTIONS)[number];
type SearchCollection = Exclude<SearchScope, "All">;

function runTime(row: Row): string | undefined {
	if (row.kind === "run") {
		return row.run;
	}
	if (row.kind === "replay") {
		return row.timestamp;
	}
	return row.startedAt;
}

function runPreview(row: Row): string {
	const time = runTime(row);
	const instant = time === undefined ? undefined : recordedInstant(time);
	const date =
		instant === undefined
			? "Date not recorded"
			: new Intl.DateTimeFormat(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(instant);
	let outcome: string;
	switch (row.kind) {
		case "run": {
			outcome =
				row.finalOutcome.state === "available" &&
				row.finalOutcome.status === "JUDGED"
					? `Final ${row.finalOutcome.verdict}`
					: row.status.toLowerCase().replaceAll("_", " ");
			break;
		}
		case "session-attempt": {
			outcome = row.status.toLowerCase().replaceAll("_", " ");
			if (row.status === "SUCCESSFUL" || row.status === "UNSUCCESSFUL") {
				outcome = `Reply/transcript checks ${row.status === "SUCCESSFUL" ? "passed" : "failed"}`;
			}
			break;
		}
		case "replay": {
			outcome = `Step ${row.stage} · ${row.status === "CONTINUE" ? "continued" : "stopped"}`;
			break;
		}
		case "group": {
			outcome = `${String(row.successful)}/${String(row.reps)} recorded successful · ${row.mode} group`;
			break;
		}
		default: {
			return row satisfies never;
		}
	}
	const cost =
		row.cost.state === "available"
			? `$${row.cost.usd.toFixed(2)}${row.cost.missing.length > 0 ? " partial cost" : " reported cost"}`
			: "Cost unavailable";
	return [row.caseId ?? "Case not recorded", date, outcome, cost].join(" · ");
}

function matchRank(result: SearchResult, query: string): number {
	const needle = query.trim().toLowerCase();
	if (result.label.toLowerCase() === needle) {
		return 0;
	}
	return result.label.toLowerCase().startsWith(needle) ? 1 : 2;
}

function runDestination(row: Row): string | undefined {
	switch (row.kind) {
		case "run": {
			return `/runs/${encodeURIComponent(row.run)}?view=${row.progress.state === "running" ? "activity" : "results"}`;
		}
		case "group": {
			return `/groups/${encodeURIComponent(row.groupId)}`;
		}
		case "session-attempt": {
			return `/attempts/session/${encodeURIComponent(row.caseId)}/${encodeURIComponent(row.uuid)}`;
		}
		case "replay": {
			const href = `/replays/${encodeURIComponent(row.lineage)}/${encodeURIComponent(row.timestamp)}`;
			return row.links.flatMap((link) =>
				link.state === "available" && link.href === href ? [link.href] : [],
			)[0];
		}
		default: {
			return row satisfies never;
		}
	}
}

function SearchResults({
	query,
	close,
}: {
	readonly query: string;
	readonly close: () => void;
}): React.JSX.Element {
	const runs = useQuery(runListingQuery);
	const cases = useQuery(casesQuery);
	const corpus = useQuery(corpusQuery);
	const comparisons = useQuery(comparisonIndexQuery);
	const [scope, setScope] = useState<SearchScope>("All");
	const results: readonly SearchResult[] = [
		...(runs.data?.rows ?? []).flatMap((row) => {
			const href = runDestination(row);
			return href === undefined || !matchesText(recordSearchTexts(row), query)
				? []
				: [
						{
							collection: "Runs" as const,
							kind: RECORD_LABELS[row.kind],
							label:
								row.shortId === undefined
									? recordIdentity(row)
									: withinCase(row.shortId, row.caseId),
							detail: runPreview(row),
							href,
						},
					];
		}),
		...(cases.data?.cases ?? [])
			.filter((entry) => matchesText([entry.id, entry.title], query))
			.map((entry) => ({
				collection: "Cases" as const,
				kind: "Case",
				label: entry.id,
				detail: entry.title,
				href: `/cases?caseId=${encodeURIComponent(entry.id)}`,
			})),
		...(corpus.data?.files ?? [])
			.filter((entry) => matchesText([entry.path, entry.sha256], query))
			.map((entry) => ({
				collection: "Instructions" as const,
				kind: "Instruction",
				label: entry.path,
				detail: "Corpus file",
				href: `/corpus?file=${encodeURIComponent(entry.path)}`,
			})),
		...(comparisons.data?.comparisons ?? [])
			.filter((entry) =>
				matchesText([entry.digest, entry.mode, ...entry.caseIds], query),
			)
			.map((entry) => ({
				collection: "Comparisons" as const,
				kind: "Comparison",
				label: entry.digest.slice(0, 12),
				detail: entry.caseIds.join(", "),
				href: `/comparisons/${encodeURIComponent(entry.digest)}`,
			})),
	];
	const visible = results.filter(
		(result) => scope === "All" || result.collection === scope,
	);
	const groups = COLLECTIONS.filter(
		(collection): collection is SearchCollection => collection !== "All",
	)
		.map((collection) => ({
			collection,
			results: visible
				.filter((result) => result.collection === collection)
				.toSorted(
					(left, right) => matchRank(left, query) - matchRank(right, query),
				),
		}))
		.filter((group) => group.results.length > 0)
		.toSorted(
			(left, right) =>
				Math.min(...left.results.map((result) => matchRank(result, query))) -
				Math.min(...right.results.map((result) => matchRank(result, query))),
		);
	const reads = [
		["Runs", runs],
		["Cases", cases],
		["Instructions", corpus],
		["Comparisons", comparisons],
	] as const;
	return (
		<div className="flex max-h-100 flex-col gap-2 overflow-y-auto px-5 pb-5">
			<Switcher
				label="Search collection"
				options={COLLECTIONS}
				selected={scope}
				onSelect={setScope}
			/>
			<p className="text-12 text-dim">
				Saved metadata only · IDs, case titles, instruction paths and digests.
				File bodies and transcripts are not searched.
			</p>
			{reads
				.filter(([, read]) => read.isError)
				.map(([label]) => (
					<p
						key={label}
						role="alert"
						className="text-14 text-attention"
					>{`${label} could not be loaded. Other results remain available.`}</p>
				))}
			{reads.some(([, read]) => read.isLoading) ? (
				<p role="status" className="text-12 text-dim">
					Loading search collections…
				</p>
			) : null}
			{query.trim() === "" ? (
				<p className="text-12 text-dim">
					Search saved run IDs, cases, instruction paths and comparison IDs.
				</p>
			) : (
				<>
					<p
						role="status"
						className="text-12 text-dim"
					>{`${visible.length} matching destinations${scope === "All" ? "" : ` in ${scope.toLowerCase()}`}`}</p>
					{visible.length === 0 ? (
						<p className="text-14 text-muted-foreground">
							No matching destinations. Try a run ID, case or file path.
						</p>
					) : (
						groups.map((group) => (
							<section
								key={group.collection}
								aria-label={`${group.collection} search results`}
								className="mt-2 flex flex-col gap-2"
							>
								<h3 className="text-12 font-medium">
									{group.collection}{" "}
									<span className="text-dim">({group.results.length})</span>
								</h3>
								{group.results.map((result) => (
									<Link
										key={`${result.kind}:${result.href}`}
										to={result.href}
										onClick={close}
										className="flex flex-col gap-1 rounded-md border border-divider bg-card px-4 py-2 hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"
									>
										<span className="flex items-center gap-3">
											<span className="text-12 text-dim">{result.kind}</span>
											<span className="min-w-0 break-words font-mono text-14 text-link">
												{result.label}
											</span>
										</span>
										<span className="text-12 text-muted-foreground">
											{result.detail}
										</span>
									</Link>
								))}
							</section>
						))
					)}
				</>
			)}
		</div>
	);
}

export function GlobalSearch(): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	useEffect(() => {
		const keydown: EventListener = (event) => {
			if (
				event instanceof KeyboardEvent &&
				(event.metaKey || event.ctrlKey) &&
				event.key.toLowerCase() === "k"
			) {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};
		document.addEventListener("keydown", keydown);
		return () => {
			document.removeEventListener("keydown", keydown);
		};
	}, []);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" aria-label="Search everything">
					<Search aria-hidden="true" className="size-4" />
					<span className="flex-1 text-left">Search</span>
					<kbd className="hidden font-mono text-12 text-dim md:inline">
						⌘ / Ctrl K
					</kbd>
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<div className="flex flex-col gap-2 border-b border-divider px-5 py-4">
					<DialogTitle>Search everything</DialogTitle>
					<DialogDescription>
						Runs, cases, instructions and saved comparisons. Escape closes
						search.
					</DialogDescription>
					<label className="mt-2 flex items-center gap-2 rounded-md border border-strong bg-card px-4">
						<Search aria-hidden="true" className="size-4 text-dim" />
						<input
							type="search"
							aria-label="Search everything"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
							}}
							className="w-full bg-transparent text-14"
						/>
					</label>
				</div>
				<div className="pt-3">
					<SearchResults
						query={query}
						close={() => {
							setOpen(false);
						}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
