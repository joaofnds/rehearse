import type { ReactNode } from "react";

import type { RunRecordResponse } from "#client/monitor/run-record-query";
import Notice from "#client/system/components/notice";

import type { AnalysisReadingResponse } from "./analysis-query";
import RecordedReading from "./analysis-recorded-reading";
import { RequestAnalysisButton, requestWords } from "./analysis-request";

const EMPTY_COLLECTION_LENGTH = 0;

const JSON_INDENT_SPACES = 2;

/**
 * SPEC.md 4c item 3: the newest root-cause analysis, disclosed as one agent's
 * reading of the recorded steps rather than a measurement.
 */
interface RootCauseAnalysisSectionProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly reading: AnalysisReadingResponse | "unreadable" | undefined;
	readonly wait: string | null;
}

function RootCauseAnalysisSection({
	run,
	record,
	reading,
	wait,
}: RootCauseAnalysisSectionProps): React.JSX.Element {
	return (
		<section
			aria-labelledby="root-cause-analysis-heading"
			className="rounded-lg border border-accent-line bg-card p-4.5"
		>
			<h2 id="root-cause-analysis-heading" className="text-16 font-semibold">
				Root-cause analysis
			</h2>
			{reading === "unreadable" ? (
				<p role="alert" className="mt-2 text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not read the root-cause analyses of this run.
				</p>
			) : null}
			{reading === undefined || reading === "unreadable" ? null : (
				<AnalysisReading
					run={run}
					record={record}
					reading={reading}
					wait={wait}
				/>
			)}
		</section>
	);
}

interface AnalysisReadingProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly reading: AnalysisReadingResponse;
	readonly wait: string | null;
}

function AnalysisReading({
	run,
	record,
	reading,
	wait,
}: AnalysisReadingProps): React.JSX.Element {
	const { request, unreadable } = reading;
	const rerun = (
		<RequestAnalysisButton
			run={run}
			request={request}
			wait={wait}
			label="Re-run the analysis"
		/>
	);

	return (
		<>
			{unreadable.length === EMPTY_COLLECTION_LENGTH ? null : (
				<div className="mt-2">
					<Notice
						message="Some analysis records could not be read"
						items={unreadable.map(({ file, reason }) => `${file}: ${reason}`)}
					/>
				</div>
			)}
			<NewestAnalysis
				run={run}
				record={record}
				reading={reading}
				wait={wait}
				rerun={rerun}
			/>
		</>
	);
}

interface NewestAnalysisProps extends AnalysisReadingProps {
	readonly rerun: ReactNode;
}

function NewestAnalysis({
	run,
	record,
	reading,
	wait,
	rerun,
}: NewestAnalysisProps): React.JSX.Element {
	const { newest, request } = reading;
	if (newest === null) {
		const offered = requestWords(request);

		return (
			<NoRecordedAnalysis
				offered={offered}
				run={run}
				request={request}
				wait={wait}
			/>
		);
	}

	if (newest.outcome === "failed") {
		return <FailedAnalysisReading newest={newest} rerun={rerun} />;
	}

	return (
		<RecordedReading
			run={run}
			record={record}
			analysis={newest}
			earlierCount={reading.earlierCount}
			rerun={rerun}
		/>
	);
}

interface NoRecordedAnalysisProps {
	readonly offered: string | undefined;
	readonly run: string;
	readonly request: AnalysisReadingResponse["request"];
	readonly wait: string | null;
}

function NoRecordedAnalysis({
	offered,
	run,
	request,
	wait,
}: NoRecordedAnalysisProps): React.JSX.Element {
	return (
		<div className="mt-2 flex flex-col gap-2 text-12">
			<p className="text-muted-foreground">
				No root-cause analysis is recorded for this run.
			</p>
			{offered === undefined ? null : (
				<p className="text-secondary-foreground">{offered}</p>
			)}
			<div>
				<RequestAnalysisButton
					run={run}
					request={request}
					wait={wait}
					label="Request a root-cause analysis"
				/>
			</div>
		</div>
	);
}

interface FailedAnalysisReadingProps {
	readonly newest: Extract<
		NonNullable<AnalysisReadingResponse["newest"]>,
		{ outcome: "failed" }
	>;
	readonly rerun: ReactNode;
}

function FailedAnalysisReading({
	newest,
	rerun,
}: FailedAnalysisReadingProps): React.JSX.Element {
	return (
		<div className="mt-2 flex flex-col gap-2 text-12">
			<p className="text-secondary-foreground">
				The newest analysis failed: {newest.reason}
			</p>
			{newest.payload === undefined ? null : (
				<pre className="max-h-60 overflow-auto rounded-md bg-raised p-2.5 font-mono leading-transcript text-13 whitespace-pre-wrap">
					{JSON.stringify(newest.payload, null, JSON_INDENT_SPACES)}
				</pre>
			)}
			<div>{rerun}</div>
		</div>
	);
}

export { RootCauseAnalysisSection as default };
