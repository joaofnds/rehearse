import { fireEvent, screen, within } from "@testing-library/react";

function comparisonChoice(groupId: string): HTMLElement {
	return screen.getByRole("checkbox", { name: `Compare ${groupId}` });
}

interface CellLookup {
	readonly run: string;
	readonly column: string;
}

function cellOf({ run, column }: CellLookup): HTMLElement {
	const row = screen.getByText(run).closest("tr");
	const table = row?.closest("table");
	if (table === null || table === undefined) {
		throw new Error(`No table for ${run}`);
	}

	const headers = within(table)
		.getAllByRole("columnheader")
		.map((header) => header.textContent);
	const cell = row?.children.item(headers.indexOf(column));

	if (!(cell instanceof HTMLElement)) {
		throw new Error(`No ${column} cell for ${run}`);
	}

	return cell;
}

function expandedFinalOutcomeOf(run: string): string {
	const cell = cellOf({ column: "Final outcome", run });
	fireEvent.click(within(cell).getByRole("button"));

	return cell.textContent?.replace("hide", "") ?? "";
}

export { comparisonChoice, cellOf, expandedFinalOutcomeOf };
