import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";
import { plural } from "#client/plural";
import { DiffPreview } from "#client/corpus/diff-preview";
import { Button } from "#client/system/ui/button";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ComparisonResponse } from "./comparison-response";
import { armRole } from "./design-arms";
import { MoreAttempts } from "./pairing-cards";

type ArmDiffResponse = InferResponseType<
	(typeof apiClient.api.comparisons)[":digest"]["arm-diff"]["$get"],
	200
>;
type ArmFileDiff = ArmDiffResponse[string][number];
type ArmFileText = ArmFileDiff["baseline"];
type BaselineArm = ComparisonResponse["baselineArm"];
type MoreAttemptsCost = ComparisonResponse["summary"][string]["moreAttempts"];

async function fetchArmDiff(digest: string): Promise<ArmDiffResponse> {
	const response = await apiClient.api.comparisons[":digest"]["arm-diff"].$get({
		param: { digest },
	});
	if (!response.ok) {
		throw new Error(`Could not load the diff between arms of ${digest}`);
	}

	return response.json();
}

function Claim({
	attribution,
}: {
	readonly attribution: ComparisonAttribution;
}): React.JSX.Element {
	switch (attribution.claim) {
		case "attributable": {
			return (
				<p>
					The only recorded corpus difference between baseline and candidate is{" "}
					<code className="font-mono text-pale">
						{attribution.differingPath}
					</code>
					. This isolates the corpus edit to one file; the repeated outcomes and
					their uncertainty determine what the comparison supports.
				</p>
			);
		}
		case "identical": {
			return (
				<p>
					Baseline and candidate ran identical corpora, so no file explains a
					movement between them.
				</p>
			);
		}
		case "refused": {
			return (
				<div className="flex flex-col gap-1.5">
					<p>
						{`${plural(attribution.differingPaths.length, "file")} differ between baseline and candidate, so no movement between them is attributed to one file.`}
					</p>
					<ul className="flex flex-col gap-1 font-mono text-pale">
						{attribution.differingPaths.map((path) => (
							<li key={path}>{path}</li>
						))}
					</ul>
				</div>
			);
		}
		default: {
			return attribution satisfies never;
		}
	}
}

function unshownText(
	arm: ComparisonArm,
	path: string,
	text: ArmFileText,
): string | undefined {
	switch (text.state) {
		case "available": {
			return undefined;
		}
		case "absent": {
			return `${armRole(arm)} ran no ${path}.`;
		}
		case "unavailable": {
			return `${armRole(arm)}'s ${path} cannot be shown: ${text.reasons.join("; ")}.`;
		}
		default: {
			return text satisfies never;
		}
	}
}

function textOf(text: ArmFileText): string | undefined {
	switch (text.state) {
		case "available": {
			return text.text;
		}
		case "absent": {
			return "";
		}
		case "unavailable": {
			return undefined;
		}
		default: {
			return text satisfies never;
		}
	}
}

function FileDiff({ file }: { readonly file: ArmFileDiff }): React.JSX.Element {
	const notes = [
		unshownText("baseline", file.path, file.baseline),
		unshownText("candidate", file.path, file.candidate),
	].filter((note) => note !== undefined);
	const before = textOf(file.baseline);
	const after = textOf(file.candidate);

	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-mono text-12 text-pale">{file.path}</span>
			{notes.map((note) => (
				<p key={note} className="text-13 text-muted-foreground">
					{note}
				</p>
			))}
			{before === undefined || after === undefined ? null : (
				<DiffPreview
					path={file.path}
					original={before}
					text={after}
					unchanged="Baseline and candidate ran the same lines."
				/>
			)}
		</div>
	);
}

function ArmDiff({
	digest,
	caseId,
}: {
	readonly digest: string;
	readonly caseId: string;
}): React.JSX.Element {
	const query = useQuery({
		queryKey: ["comparison-arm-diff", digest],
		queryFn: () => fetchArmDiff(digest),
	});
	if (query.isPending) {
		return <p className="text-13 text-muted-foreground">Reading both arms…</p>;
	}
	if (query.isError) {
		return (
			<p role="alert" className="text-13 text-secondary-foreground">
				The diff between arms could not be loaded.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{(query.data[caseId] ?? []).map((file) => (
				<FileDiff key={file.path} file={file} />
			))}
		</div>
	);
}

/** What a movement between baseline and candidate can be put down to, and how to see it. */
export function AttributionCard({
	digest,
	caseId,
	attribution,
	baselineArm,
	moreAttempts,
}: {
	readonly digest: string;
	readonly caseId: string;
	readonly attribution: ComparisonAttribution;
	readonly baselineArm: BaselineArm;
	readonly moreAttempts: MoreAttemptsCost;
}): React.JSX.Element {
	const [diffOpen, setDiffOpen] = useState(false);

	return (
		<section
			aria-label={`Attribution · ${caseId}`}
			className="flex max-w-301 flex-col gap-2 rounded-lg border bg-card px-4 py-3"
		>
			<h3>
				<span className="text-12 text-muted-foreground">Attribution</span>
			</h3>
			<Claim attribution={attribution} />
			<div className="flex flex-wrap items-center gap-2">
				{attribution.claim === "identical" ? null : (
					<Button
						variant="quiet"
						size="compact"
						aria-expanded={diffOpen}
						onClick={() => {
							setDiffOpen(!diffOpen);
						}}
					>
						See the diff between arms
					</Button>
				)}
				<MoreAttempts
					digest={digest}
					baselineArm={baselineArm}
					cost={moreAttempts}
				/>
			</div>
			{diffOpen ? <ArmDiff digest={digest} caseId={caseId} /> : null}
		</section>
	);
}
