import type {
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
	SessionHistoryRequestUsage,
} from "#benchmark/session-history";
import type { TranscriptInstructionLoads } from "#benchmark/transcript-instruction-loads";

import { requestCostLabel } from "./request-cost-readings";

const EMPTY_COLLECTION_LENGTH = 0;

const PERCENT_SCALE = 100;

const tokens = new Intl.NumberFormat("en-US");

function totalsLabel(series: SessionHistoryRequestSeries): string {
	const { attemptTotals } = series;
	if (attemptTotals.state === "unavailable") {
		return `? Unavailable · ${attemptTotals.reasons.join(", ")}`;
	}
	if (attemptTotals.state === "incomplete") {
		return `◐ Incomplete · ${tokens.format(attemptTotals.totalInputTokens)} total input tokens over ${attemptTotals.countedRequestCount} of ${attemptTotals.requestCount} requests · ${attemptTotals.reasons.join(", ")}`;
	}

	return `✓ Complete · ${tokens.format(attemptTotals.totalInputTokens)} total input tokens over ${attemptTotals.requestCount} attempt requests`;
}

function totalLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.usageState === "complete") {
		return tokens.format(entry.totalInputTokens);
	}

	return entry.usageState;
}

function categoryLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.usageState === "conflict") {
		return "usage conflict";
	}

	if (entry.usageState === "incomplete") {
		return `at least ${categories(entry.lowerBound)}`;
	}

	return categories(entry.usage);
}

function categories(usage: SessionHistoryRequestUsage): string {
	return [
		`in ${tokens.format(usage.inputTokens)}`,
		`out ${tokens.format(usage.outputTokens)}`,
		`read ${tokens.format(usage.cacheReadTokens)}`,
		`write ${tokens.format(usage.cacheWriteTokens)}`,
	].join(" · ");
}

function modelLabel(entry: SessionHistoryRequestEntry): string {
	if (entry.modelState === "conflict") {
		return "model conflict";
	}

	return entry.model ?? "? Unavailable model";
}

interface InstructionLoadsProps {
	readonly loads: TranscriptInstructionLoads;
}

function InstructionLoads({ loads }: InstructionLoadsProps): React.JSX.Element {
	if (loads.state === "unavailable") {
		return (
			<p className="px-3 py-2.5 text-14 text-attention">
				? Unavailable · the transcript carries no instructions attachment.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1.5 px-3 py-2.5">
			{loads.loads.map((load, index) => (
				<li
					key={`${index}:${load.memoryType}:${load.filePath}`}
					className="flex min-w-0 flex-col gap-0.5"
				>
					<code className="truncate font-mono text-12 text-accent-foreground">
						{load.filePath}
					</code>
					<small className="text-12 text-muted-foreground">
						{load.memoryType}
					</small>
					<small className="text-12 text-muted-foreground">
						reason, trigger and include parent unavailable in the transcript
					</small>
				</li>
			))}
			{loads.loads.length === EMPTY_COLLECTION_LENGTH ? (
				<li>The attachment names no loaded file.</li>
			) : null}
		</ul>
	);
}

interface SelectedRequestProps {
	readonly entry: SessionHistoryRequestEntry | undefined;
	readonly cost: SessionHistoryRequestCost | undefined;
}

function SelectedRequest({
	entry,
	cost,
}: SelectedRequestProps): React.JSX.Element | null {
	if (entry === undefined) {
		return null;
	}
	return (
		<section
			aria-label="Selected request"
			className="border-b bg-muted px-3 py-3"
		>
			<h3 className="text-14 font-medium">
				{entry.requestId ?? `Request at line ${entry.line}`}
			</h3>
			<p className="mt-1 text-12 text-muted-foreground">
				Session root · {entry.region} · line {entry.line} · {modelLabel(entry)}
			</p>
			<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
				<p className="font-mono text-14">
					{totalLabel(entry)}{" "}
					<span className="text-12 text-secondary-foreground">
						total input tokens
					</span>
				</p>
				<p className="font-mono text-14">
					{requestCostLabel(cost, entry.region)}
				</p>
			</div>
			<p className="mt-2 font-mono text-12 text-secondary-foreground">
				{categoryLabel(entry)}
			</p>
			<p className="mt-1 text-12 text-muted-foreground">
				Input = uncached + cache read + cache write. Output is separate. Cost is
				calculated from request usage and catalog rates; it is not a separately
				reported provider charge.
			</p>
		</section>
	);
}

export {
	categories,
	categoryLabel,
	InstructionLoads,
	modelLabel,
	PERCENT_SCALE,
	SelectedRequest,
	tokens,
	totalLabel,
	totalsLabel,
};
