import { useState } from "react";

import type { ArmChoice, ChosenArm } from "./history-comparison-choice";

interface ComparisonChoice {
	readonly choice: ArmChoice;
	readonly chosen: readonly ChosenArm[];
	readonly clearChoice: () => void;
}

function useComparisonChoice(): ComparisonChoice {
	const [chosen, setChosen] = useState<readonly ChosenArm[]>([]);
	const choice: ArmChoice = {
		chosen,
		onToggle: (arm) => {
			setChosen((current) =>
				current.some(({ groupId }) => groupId === arm.groupId)
					? current.filter(({ groupId }) => groupId !== arm.groupId)
					: [...current, arm],
			);
		},
	};
	function clearChoice(): void {
		setChosen([]);
	}
	return { choice, chosen, clearChoice };
}

export { useComparisonChoice as default };
