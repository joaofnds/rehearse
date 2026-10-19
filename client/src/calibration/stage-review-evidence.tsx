import { useId } from "react";

import RecordedText from "#client/system/components/recorded-text";
import SectionLabel from "#client/system/components/section-label";

import type { StageReview } from "./stage-review-query";

const EMPTY_COLLECTION_LENGTH = 0;

const REVIEW_SECTIONS = ["Task", "Output", "Instructions", "Evidence"] as const;

interface ReviewInputField {
	readonly field: string;
	readonly text: string;
}

type ReviewSection = (typeof REVIEW_SECTIONS)[number];

function inputSection(field: string): ReviewSection {
	const normalized = field.toLowerCase().replaceAll(/[^a-z]/gu, "");
	if (["task", "productbrief"].includes(normalized)) {
		return "Task";
	}
	if (
		[
			"artifact",
			"taskstate",
			"diff",
			"changedpaths",
			"commitsubjects",
			"output",
		].includes(normalized)
	) {
		return "Output";
	}
	return normalized === "instructions" ? "Instructions" : "Evidence";
}

interface InputReadProps {
	readonly input: StageReview["input"];
}

function InputRead({ input }: InputReadProps): React.JSX.Element {
	const headingId = useId();
	const inputs = Object.entries(input).map(([field, text]) => ({
		field,
		section: inputSection(field),
		text,
	}));

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<h2 id={headingId}>
				<SectionLabel>What the judge read</SectionLabel>
			</h2>
			<ReviewEvidenceNavigation />
			{REVIEW_SECTIONS.map((label) => {
				const fields = inputs.filter((entry) => entry.section === label);
				return (
					<ReviewEvidenceSection key={label} label={label} fields={fields} />
				);
			})}
		</section>
	);
}

interface ReviewEvidenceSectionProps {
	readonly label: ReviewSection;
	readonly fields: readonly ReviewInputField[];
}

function ReviewEvidenceSection({
	label,
	fields,
}: ReviewEvidenceSectionProps): React.JSX.Element {
	return (
		<section
			key={label}
			id={`review-${label.toLowerCase()}`}
			aria-label={label}
			tabIndex={-1}
			className="scroll-mt-20 rounded-lg border border-divider bg-card p-4"
		>
			<h3 className="mb-3 text-15 font-medium">{label}</h3>
			{fields.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					Not recorded in this saved Judge input.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					{fields.map(({ field, text }) => (
						<div key={field}>
							<p className="font-mono text-12 text-dim">{field}</p>
							<div className="mt-1 max-h-100 overflow-auto">
								{label === "Task" || label === "Instructions" ? (
									<RecordedText text={text} />
								) : (
									<pre className="font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere">
										{text}
									</pre>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function ReviewEvidenceNavigation(): React.JSX.Element {
	return (
		<nav
			aria-label="Review evidence sections"
			className="sticky top-0 z-10 flex flex-wrap gap-1 rounded-md border border-divider bg-background p-1"
		>
			{REVIEW_SECTIONS.map((label) => (
				<a
					key={label}
					href={`#review-${label.toLowerCase()}`}
					className="rounded-md px-3 py-2 text-14 text-link hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"
				>
					{label}
				</a>
			))}
		</nav>
	);
}

export { InputRead as default };
