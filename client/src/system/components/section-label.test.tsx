import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import SectionLabel from "./section-label";

describe(SectionLabel.name, () => {
	it("renders its children as text", () => {
		render(<SectionLabel>DURABLE RECORDS</SectionLabel>);

		expect(screen.getByText("DURABLE RECORDS")).toBeInTheDocument();
	});
});
