import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import type { NodeStatus } from "#client/monitor/task-graph";
import CorpusPill from "#client/system/components/corpus-pill";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";

const STEP_NUMBER_DIGITS = 2;

interface StatusWordsProps {
	readonly status: NodeStatus;
}

function StatusWords({ status }: StatusWordsProps): React.JSX.Element {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-12 text-muted-foreground wrap-anywhere">
			{status.state === "running" ? (
				<LiveGlyph tone="surrounding" />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY[status.state].glyph}</span>
			)}
			{status.words}
		</span>
	);
}

interface CorpusReadingProps {
	readonly stage: MonitoredStage;
}

function CorpusReading({ stage }: CorpusReadingProps): React.JSX.Element {
	const { corpusVersion } = stage;

	return (
		<span className="ml-auto">
			{corpusVersion?.kind === "version" ? (
				<CorpusPill hash={corpusVersion.digest} />
			) : (
				<span className="text-12 text-muted-foreground">
					{corpusMeasurementReading(corpusVersion)}
				</span>
			)}
		</span>
	);
}

interface CardHeaderProps {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly status: NodeStatus;
	readonly meta: string;
}

function CardHeader({
	stage,
	number,
	status,
	meta,
}: CardHeaderProps): React.JSX.Element {
	return (
		<div
			className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2.75 ${status.state === "stopped" ? "bg-fired" : "bg-raised"}`}
		>
			<span aria-hidden="true" className="font-mono text-12 text-dim">
				{String(number).padStart(STEP_NUMBER_DIGITS, "0")}
			</span>
			<h2 className="min-w-0 text-16 font-medium wrap-anywhere">
				{stage.stage}
			</h2>
			<StatusWords status={status} />
			<span className="min-w-0 font-mono text-12 text-dim wrap-anywhere">
				{meta}
			</span>
			<CorpusReading stage={stage} />
			<span className="w-8 text-right">
				<Grade
					size="node"
					value={
						stage.grade.state === "available"
							? { letter: stage.grade.letter }
							: { pending: true }
					}
				/>
			</span>
		</div>
	);
}

export { CardHeader, StatusWords };
