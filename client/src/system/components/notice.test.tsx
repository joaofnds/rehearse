import { beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, render, screen, within } from "@testing-library/react";

import Notice from "./notice";

describe(Notice.name, () => {
	it("announces its message as an alert", announcesItsMessageAsAnAlert);

	it("lists every item under the message", listsEveryItemUnderTheMessage);

	it(
		"carries further detail after the list, inside the alert",
		carriesFurtherDetailAfterTheListInsideTheAlert,
	);
	describe("optional diagnostics", noticeDisclosure);
});

function announcesItsMessageAsAnAlert(): void {
	render(<Notice message="These runs could not be read" items={["r-1"]} />);

	expect(screen.getByRole("alert")).toHaveTextContent(
		"These runs could not be read",
	);
}

function listsEveryItemUnderTheMessage(): void {
	const expectedListItemCount = 2;

	render(<Notice message="Refused" items={["CLAUDE.md", "agents/a.md"]} />);

	expect(
		within(screen.getByRole("alert")).getAllByRole("listitem"),
	).toHaveLength(expectedListItemCount);
}

function carriesFurtherDetailAfterTheListInsideTheAlert(): void {
	render(
		<Notice message="Refused" items={["2 runs"]}>
			<p>run:a: no manifest recorded</p>
		</Notice>,
	);

	expect(screen.getByRole("alert")).toHaveTextContent(
		"run:a: no manifest recorded",
	);
}

function noticeDisclosure(): void {
	beforeEach(() => {
		render(
			<Notice
				message="Some records could not be read"
				items={["run:r1: missing manifest"]}
				collapsible
			/>,
		);
	});
	it("starts collapsed with no diagnostic list", startsWithNoDiagnosticList);
	it(
		"opens the complete diagnostic and names the expanded state",
		opensTheCompleteDiagnosticList,
	);
	it(
		"hides the diagnostic again and restores the closed label",
		hidesTheDiagnosticListAgain,
	);
}
function startsWithNoDiagnosticList(): void {
	const alert = screen.getByRole("alert");
	const toggle = within(alert).getByRole("button", {
		name: "Show details (1)",
	});
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	expect(within(alert).queryByRole("list")).not.toBeInTheDocument();
}
function opensTheCompleteDiagnosticList(): void {
	const alert = screen.getByRole("alert");
	const toggle = within(alert).getByRole("button", {
		name: "Show details (1)",
	});
	fireEvent.click(toggle);
	expect(within(alert).getByRole("listitem")).toHaveTextContent(
		"run:r1: missing manifest",
	);
	expect(toggle).toHaveAccessibleName("Hide details");
	expect(toggle).toHaveAttribute("aria-expanded", "true");
}
function hidesTheDiagnosticListAgain(): void {
	const alert = screen.getByRole("alert");
	const toggle = within(alert).getByRole("button", {
		name: "Show details (1)",
	});
	fireEvent.click(toggle);
	fireEvent.click(toggle);
	expect(within(alert).queryByRole("list")).not.toBeInTheDocument();
	expect(toggle).toHaveAccessibleName("Show details (1)");
}
