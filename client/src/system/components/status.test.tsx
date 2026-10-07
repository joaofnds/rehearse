import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { STATUS_STATES, STATUS_VOCABULARY, Status } from "./status";

describe(Status.name, () => {
	it.each([...STATUS_STATES])(
		"renders the glyph and the word for %s",
		(state) => {
			render(<Status state={state} />);

			const { glyph, word } = STATUS_VOCABULARY[state];
			expect(screen.getByText(word)).toBeInTheDocument();
			expect(screen.getByText(glyph)).toBeInTheDocument();
		},
	);

	it("marks the glyph decorative so the word is the only accessible name", () => {
		render(<Status state="accepted" />);

		const glyph = screen.getByText(STATUS_VOCABULARY.accepted.glyph);
		expect(glyph).toHaveAttribute("aria-hidden", "true");
	});

	it("puts a phrase in the word's place, keeping the state's glyph", () => {
		render(<Status state="stopped" label="stopped at step 3" />);

		expect(screen.getByText("stopped at step 3")).toBeInTheDocument();
		expect(
			screen.queryByText(STATUS_VOCABULARY.stopped.word),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(STATUS_VOCABULARY.stopped.glyph),
		).toBeInTheDocument();
	});
});
