import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import { Status } from "./status";
import TableShell from "./table-shell";

describe(TableShell.name, () => {
	it(
		"renders the caption as a visual section label",
		rendersTheCaptionAsAVisualSectionLabel,
	);

	it(
		"renders one column header per declared column",
		rendersOneColumnHeaderPerDeclaredColumn,
	);

	it(
		"renders one row per declared row, cells in column order",
		rendersOneRowPerDeclaredRowCellsInColumnOrder,
	);

	it(
		"renders a component cell rather than only a string",
		rendersAComponentCellRatherThanOnlyAString,
	);
});

function rendersTheCaptionAsAVisualSectionLabel(): void {
	render(
		<TableShell
			caption="DURABLE RECORDS"
			columns={["Run", "Case"]}
			rows={[["r-0148", "auth-refactor"]]}
		/>,
	);

	expect(screen.getByText("DURABLE RECORDS")).toBeInTheDocument();
}

function rendersOneColumnHeaderPerDeclaredColumn(): void {
	render(
		<TableShell
			caption="DURABLE RECORDS"
			columns={["Run", "Case", "Outcome"]}
			rows={[]}
		/>,
	);

	expect(screen.getByRole("columnheader", { name: "Run" })).toBeInTheDocument();
	expect(
		screen.getByRole("columnheader", { name: "Case" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("columnheader", { name: "Outcome" }),
	).toBeInTheDocument();
}

function rendersOneRowPerDeclaredRowCellsInColumnOrder(): void {
	const expectedRowCount = 3;

	render(
		<TableShell
			caption="DURABLE RECORDS"
			columns={["Run", "Case"]}
			rows={[
				["r-0148", "auth-refactor"],
				["r-0147", "doc-rewrite"],
			]}
		/>,
	);

	const rows = screen.getAllByRole("row");
	// Header row + 2 data rows
	expect(rows).toHaveLength(expectedRowCount);
	expect(screen.getByText("r-0148")).toBeInTheDocument();
	expect(screen.getByText("doc-rewrite")).toBeInTheDocument();
}

function rendersAComponentCellRatherThanOnlyAString(): void {
	render(
		<TableShell
			caption="DURABLE RECORDS"
			columns={["Run", "Outcome"]}
			rows={[["r-0148", <Status key="status" state="accepted" />]]}
		/>,
	);

	expect(screen.getByText("accepted")).toBeInTheDocument();
}
