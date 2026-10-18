import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Notice } from "./notice";

describe(Notice.name, () => {
	it("announces its message as an alert", () => {
		render(<Notice message="These runs could not be read" items={["r-1"]} />);

		expect(screen.getByRole("alert")).toHaveTextContent(
			"These runs could not be read",
		);
	});

	it("lists every item under the message", () => {
		render(<Notice message="Refused" items={["CLAUDE.md", "agents/a.md"]} />);

		expect(
			within(screen.getByRole("alert")).getAllByRole("listitem"),
		).toHaveLength(2);
	});

	it("carries further detail after the list, inside the alert", () => {
		render(
			<Notice message="Refused" items={["2 runs"]}>
				<p>run:a: no manifest recorded</p>
			</Notice>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent(
			"run:a: no manifest recorded",
		);
	});
	it("keeps optional diagnostics collapsed until requested and can hide them again", () => {
		render(
			<Notice
				message="Some records could not be read"
				items={["run:r1: missing manifest"]}
				collapsible
			/>,
		);

		const alert = screen.getByRole("alert");
		const toggle = within(alert).getByRole("button", {
			name: "Show details (1)",
		});
		expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(within(alert).queryByRole("list")).not.toBeInTheDocument();

		fireEvent.click(toggle);

		expect(within(alert).getByRole("listitem")).toHaveTextContent(
			"run:r1: missing manifest",
		);
		expect(toggle).toHaveAccessibleName("Hide details");
		expect(toggle).toHaveAttribute("aria-expanded", "true");

		fireEvent.click(toggle);

		expect(within(alert).queryByRole("list")).not.toBeInTheDocument();
		expect(toggle).toHaveAccessibleName("Show details (1)");
	});
});
