import { expect } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

async function edited(text = "instructions, edited\nkeep\n"): Promise<void> {
	const textbox = await openInstructionEditor();
	await waitFor(() => {
		expect(textbox).toHaveValue("instructions\nkeep\n");
	});
	fireEvent.change(textbox, { target: { value: text } });
}

async function reviewed(): Promise<void> {
	await edited();
	fireEvent.click(screen.getByRole("button", { name: "Review" }));
	await screen.findByText("Marks 3 recorded results stale, none deleted");
}

async function appliedEdit(): Promise<void> {
	await reviewed();
	fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	await screen.findByText(/Applied CLAUDE\.md/u);
}

async function openInstructionEditor(): Promise<HTMLElement> {
	fireEvent.click(
		await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
	);

	return await screen.findByRole("textbox", { name: "Text of CLAUDE.md" });
}

async function applySourceEdit(): Promise<void> {
	const field = await screen.findByRole("textbox", {
		name: "Text of CLAUDE.md",
	});
	fireEvent.change(field, {
		target: { value: "instructions, edited\nkeep\n" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Review" }));
	await screen.findByText("Marks 3 recorded results stale, none deleted");
	fireEvent.click(screen.getByRole("button", { name: "Apply" }));
	await screen.findByText(/Applied CLAUDE\.md/u);
}

export {
	appliedEdit,
	applySourceEdit,
	edited,
	openInstructionEditor,
	reviewed,
};
