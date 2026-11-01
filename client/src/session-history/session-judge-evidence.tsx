import type { JudgeGrade } from "#benchmark/contracts";
import type { SessionJudgeEvidence as JudgeRecord } from "#server/attempt-evidence-contract";

interface SessionJudgeEvidenceProps {
	readonly judge: JudgeRecord | undefined;
}

interface JudgeRequirementsProps {
	readonly grade: JudgeGrade;
}
interface JudgeInputsProps {
	readonly judge: JudgeRecord;
}

function JudgeRequirements({
	grade,
}: JudgeRequirementsProps): React.JSX.Element {
	return (
		<>
			<p className="mt-2 text-14">{grade.summary}</p>
			<ul className="mt-3 space-y-3">
				{grade.requirements.map((requirement) => (
					<li key={requirement.id}>
						<p className="text-14 font-medium">
							{requirement.status} · {requirement.id}
						</p>
						{requirement.evidence.map((evidence, index) => (
							<details
								key={`${evidence.path}:${String(index)}`}
								className="mt-2"
							>
								<summary className="cursor-pointer text-14">
									{evidence.path}: {evidence.claim}
								</summary>
								<blockquote className="mt-2 whitespace-pre-wrap text-14">
									{evidence.quote}
								</blockquote>
							</details>
						))}
					</li>
				))}
			</ul>
		</>
	);
}

function JudgeInputs({ judge }: JudgeInputsProps): React.JSX.Element {
	return (
		<details className="mt-3">
			<summary className="cursor-pointer text-14">
				Judge rubric and supplied evidence
			</summary>
			<pre className="mt-2 overflow-auto whitespace-pre-wrap text-13">
				{judge.definition.rubric}
			</pre>
			{judge.input.files.map((file) => (
				<details key={file.path} className="mt-2">
					<summary className="cursor-pointer text-14">{file.path}</summary>
					<pre className="mt-2 overflow-auto whitespace-pre-wrap text-13">
						{file.content}
					</pre>
				</details>
			))}
		</details>
	);
}

function SessionJudgeEvidence({
	judge,
}: SessionJudgeEvidenceProps): React.JSX.Element | null {
	if (judge === undefined) {
		return null;
	}

	return (
		<section className="mt-4" aria-label="Session Judge">
			<h3 className="text-14 font-medium">
				Session Judge:{" "}
				{judge.status === "GRADED" ? judge.grade.verdict : judge.status}
			</h3>
			<p className="mt-2 text-12 text-dim">
				{judge.model} · ${String(judge.costUsd)} · Uncalibrated: human agreement
				is not recorded.
			</p>
			<p className="mt-2 text-14">
				The recorded outcome covers reply/transcript checks. This Judge assesses
				quality separately.
			</p>
			{judge.status === "GRADED" ? (
				<JudgeRequirements grade={judge.grade} />
			) : (
				<p className="mt-2 text-14">No quality grade: {judge.detail}</p>
			)}
			<JudgeInputs judge={judge} />
		</section>
	);
}

export { SessionJudgeEvidence as default };
