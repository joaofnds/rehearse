import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import CorpusPill from "./corpus-pill";

describe(CorpusPill.name, () => {
	it("renders the corpus hash as corpus@<hash>", () => {
		render(<CorpusPill hash="a41c7e" />);

		expect(screen.getByText("corpus@a41c7e")).toBeInTheDocument();
	});
});
