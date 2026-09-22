import { describe, expect, it } from "bun:test";
import { render, screen, within } from "@testing-library/react";
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
});
