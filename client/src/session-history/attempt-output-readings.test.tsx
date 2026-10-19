import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, render, screen, within } from "@testing-library/react";

import { SavedOutput, ScorecardEvidence } from "./attempt-evidence";
import { grade, originalFetch } from "./attempt-evidence-test-fixtures";

const artifact = {
	line: "saved line\n",
	lineCount: 100,
	namePart: "SavedDelivery",
	namePartRepetitions: 12,
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("saved attempt evidence", () => {
	it(
		"opens a cached diff in Raw when replacing a formatted output",
		opensACachedDiffInRawWhenReplacingAFormattedOutput,
	);

	it(
		"switches a formatted reading back to the exact saved source",
		switchesAFormattedReadingBackToTheExactSavedSource,
	);

	it(
		"renders a retained delivery diff separately from the completed reply",
		rendersARetainedDeliveryDiffSeparatelyFromTheCompletedReply,
	);

	it(
		"opens the complete saved output as literal text and closes it",
		opensTheCompleteSavedOutputAsLiteralTextAndClosesIt,
	);
});

function opensACachedDiffInRawWhenReplacingAFormattedOutput(): void {
	const { rerender, container } = render(
		<SavedOutput title="Output" text="# Artifact" />,
	);
	expect(screen.getByRole("heading", { name: "Artifact" })).toBeVisible();

	rerender(
		<SavedOutput
			title="Output"
			text={"-  removed\n+  added"}
			initialMode="Raw"
		/>,
	);

	expect(
		screen.getByRole("button", { name: "Raw", pressed: true }),
	).toBeVisible();
	expect(container.querySelector("pre")?.textContent).toBe(
		"-  removed\n+  added",
	);
}

function switchesAFormattedReadingBackToTheExactSavedSource(): void {
	const text =
		"# Saved heading\n\n- one\n- two\n\n```ts\nconst value = 1;\n```\n";
	render(<SavedOutput title="Reply" text={text} />);

	expect(
		screen.getByRole("heading", { name: "Saved heading" }),
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Raw" }));

	expect(
		screen.getByRole("region", { name: "Reply" }).querySelector("pre")
			?.textContent,
	).toBe(text);
}

function rendersARetainedDeliveryDiffSeparatelyFromTheCompletedReply(): void {
	render(
		<ScorecardEvidence
			record={{
				assessment: grade,
				diff: "The separate saved diff.",
				kind: "stage",
				output: {
					kind: "reply",
					state: "available",
					text: "The actual completed reply.",
				},
				stage: "build",
				state: "available",
			}}
		/>,
	);
	expect(
		screen.getByRole("region", { name: "Saved completion reply" }),
	).toHaveTextContent("The actual completed reply.");
	expect(
		screen.getByText("Saved delivery diff", { selector: "summary" }),
	).toBeInTheDocument();
}

async function opensTheCompleteSavedOutputAsLiteralTextAndClosesIt(): Promise<void> {
	const text = `<script>bad()</script>\n${artifact.line.repeat(artifact.lineCount)}`;
	const title = `artifact-${artifact.namePart.repeat(artifact.namePartRepetitions)}.md`;
	render(<SavedOutput title={title} text={text} />);
	fireEvent.click(screen.getByRole("button", { name: "Open complete output" }));
	const dialog = await screen.findByRole("dialog", {
		name: "Complete saved output",
	});
	expect(within(dialog).getByText(title)).toBeInTheDocument();
	expect(dialog.querySelector("pre")?.textContent).toBe(text);
	expect(dialog.querySelector("script")).toBeNull();
	fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}
