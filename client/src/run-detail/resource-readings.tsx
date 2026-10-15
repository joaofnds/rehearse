import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { spendReading } from "#client/run-history/run-progress";

type Tokens = RunRecordResponse["totals"]["tokens"];

function TokenReading({
	label,
	reading,
}: {
	readonly label: string;
	readonly reading: Tokens;
}): React.JSX.Element {
	if (reading.state === "unavailable") {
		return (
			<p className="text-11-5 text-dim">
				{label}: not recorded · {reading.reasons.join("; ")}
			</p>
		);
	}
	const values = [
		["Input", reading.input],
		["Cache read", reading.cacheRead],
		["Cache write", reading.cacheWrite],
		["Output", reading.output],
	] as const;
	return (
		<section aria-label={label}>
			<h3 className="text-12 font-medium">
				{label}
				{reading.missing.length === 0 ? "" : " · partial"}
			</h3>
			<dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
				{values.map(([term, value]) => (
					<div key={term}>
						<dt className="text-11 text-dim">{term}</dt>
						<dd className="font-mono text-12">{value.toLocaleString()}</dd>
					</div>
				))}
			</dl>
			{reading.missing.map(({ part, reason }) => (
				<p key={part} className="mt-1 text-11 text-dim">
					Missing {part}: {reason}
				</p>
			))}
		</section>
	);
}

export function ResourceReadings({
	record,
	stage,
}: {
	readonly record: RunRecordResponse;
	readonly stage: RunRecordResponse["stages"][number];
}): React.JSX.Element {
	const { cost } = record.totals;
	return (
		<div className="mt-4 flex flex-col gap-4 border-t border-divider pt-4">
			<TokenReading label="Selected step tokens" reading={stage.tokens} />
			<TokenReading label="Whole run tokens" reading={record.totals.tokens} />
			<section aria-label="Run cost breakdown">
				<h3 className="text-12 font-medium">Run cost breakdown</h3>
				{cost.state === "unavailable" ? (
					<p className="text-11-5 text-dim">
						Not recorded · {cost.reasons.join("; ")}
					</p>
				) : (
					<>
						<ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
							{cost.parts.map(({ part, usd }) => (
								<li key={part} className="text-11-5">
									<span className="text-dim">{part}</span>{" "}
									<span className="font-mono">{spendReading(usd)}</span>
								</li>
							))}
						</ul>
						{cost.missing.map(({ part, reason }) => (
							<p key={part} className="mt-1 text-11-5 text-dim">
								Missing {part}: {reason}
							</p>
						))}
					</>
				)}
			</section>
		</div>
	);
}
