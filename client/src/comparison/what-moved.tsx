import type { ComparisonArm } from "#benchmark/comparison-record";
import TableShell from "#client/system/components/table-shell";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import { DESIGN_ARMS } from "./design-arms";
import whatMovedRow from "./what-moved-cells";

interface WhatMovedProps {
	readonly caseId: string;
	readonly rows: readonly WhatMovedRow[];
	readonly attemptsPerArm: Readonly<Record<ComparisonArm, number>>;
}

function WhatMoved({
	caseId,
	rows,
	attemptsPerArm,
}: WhatMovedProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 overflow-x-auto">
			<p className="text-12 text-muted-foreground">
				Saved attempts:{" "}
				{DESIGN_ARMS.map(
					({ arm, role }) => `${role} ${attemptsPerArm[arm]}`,
				).join(" · ")}
				. Coverage is shown per measure. Passing every recorded attempt does not
				establish equivalent quality.
			</p>
			<TableShell
				caption={
					<>
						What moved ·{" "}
						<span className="font-mono tracking-normal normal-case">
							{caseId}
						</span>
					</>
				}
				columns={[
					"Measure",
					...DESIGN_ARMS.map(({ role }) => role),
					"Range and uncertainty",
					"Candidate vs baseline",
				]}
				rows={rows.map((row) => whatMovedRow(row))}
			/>
		</div>
	);
}

export { WhatMoved as default };
