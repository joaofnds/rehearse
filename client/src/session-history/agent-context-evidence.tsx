import type {
	AvailableSubAgent,
	ExcerptRequest,
	Readings,
} from "./agent-tree-model";
import {
	EMPTY_COLLECTION_LENGTH,
	agentName,
	requestLabel,
	sizeLabel,
} from "./agent-tree-model";

interface ContextHistoryProps {
	readonly readings: Readings;
	readonly laterTurns: AvailableSubAgent["laterTurns"];
}

function ContextHistory({
	readings,
	laterTurns,
}: ContextHistoryProps): React.JSX.Element {
	const rows = [
		...readings.series.entries.map((entry) => ({
			label: requestLabel(entry),
			line: entry.line,
		})),
		...readings.series.compactions.map(({ line }) => ({
			label: `line ${line} · compaction`,
			line,
		})),
		...laterTurns.map(({ line, kind }) => ({
			label: `line ${line} · ${kind}`,
			line,
		})),
	].toSorted((left, right) => left.line - right.line);

	return (
		<ul aria-label="Context history" className="flex flex-col gap-1">
			{rows.map(({ line, label }) => (
				<li key={`${line}:${label}`} className="font-mono text-12">
					{label}
				</li>
			))}
			{rows.length === EMPTY_COLLECTION_LENGTH ? (
				<li className="text-12 text-muted-foreground">No request recorded.</li>
			) : null}
		</ul>
	);
}

interface LoadEvidenceProps {
	readonly agentId: string | undefined;
	readonly readings: Readings;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

function LoadEvidence({
	agentId,
	readings,
	onOpenExcerpt,
	onSelectSource,
}: LoadEvidenceProps): React.JSX.Element {
	const names = new Map(
		readings.deliveries.map(({ id, name }) => [id, name] as const),
	);

	return (
		<ul aria-label="Load evidence" className="flex flex-col gap-1.5">
			{readings.deliveryEvents.map(
				({ sourceId, eventId, ordinal, measurement }) => (
					<li key={eventId} className="flex flex-col gap-0.5">
						<span className="font-mono text-12">
							<button
								type="button"
								aria-label={`Show the agents that received ${names.get(sourceId) ?? sourceId}`}
								className="max-w-full text-left wrap-anywhere underline hover:text-foreground"
								onClick={() => {
									onSelectSource(sourceId);
								}}
							>
								{names.get(sourceId) ?? sourceId}
							</button>{" "}
							· delivery {ordinal} · event {eventId}
						</span>
						<small className="text-12 text-muted-foreground">
							{sizeLabel(measurement)}
						</small>
						<ExcerptButton
							agentId={agentId}
							ordinal={ordinal}
							eventId={eventId}
							onOpen={() => {
								onOpenExcerpt({ agentId, eventId });
							}}
						/>
					</li>
				),
			)}
			{readings.deliveryEvents.length === EMPTY_COLLECTION_LENGTH ? (
				<li className="text-12 text-muted-foreground">No observed delivery.</li>
			) : null}
		</ul>
	);
}

interface ExcerptButtonProps {
	readonly agentId: string | undefined;
	readonly ordinal: number;
	readonly eventId: string;
	readonly onOpen: () => void;
}

function ExcerptButton({
	agentId,
	ordinal,
	eventId,
	onOpen,
}: ExcerptButtonProps): React.JSX.Element {
	return (
		<button
			type="button"
			aria-label={`Open excerpt of ${agentName(agentId)}'s delivery ${ordinal} · event ${eventId}`}
			className="self-start text-14 text-link underline hover:text-foreground"
			onClick={onOpen}
		>
			Open excerpt
		</button>
	);
}

export { ContextHistory, ExcerptButton, LoadEvidence };
