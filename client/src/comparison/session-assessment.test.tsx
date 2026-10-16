import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SessionAssessment } from "./session-assessment";

describe(SessionAssessment.name, () => {
	it("keeps an older response's missing projection explicit without inferring check results", () => {
		render(<SessionAssessment assessment={undefined} />);

		expect(
			screen.getByRole("heading", { name: "Recorded session checks" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				/The separate check-layer summary is unavailable in this response/u,
			),
		).toBeInTheDocument();
		expect(screen.queryByText(/passed$/u)).not.toBeInTheDocument();
		expect(screen.queryByRole("figure")).not.toBeInTheDocument();
	});
});
