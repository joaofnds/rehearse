import { stdin as input, stderr } from "node:process";
import { createInterface } from "node:readline/promises";

import { processOutput, signalDiagnostics } from "./output";

interface TerminalQuestioner {
	readonly question: (message: string) => Promise<string>;
	readonly close: () => void;
}

function terminalQuestioner(
	flush: () => Promise<void> = signalDiagnostics(processOutput).flush,
): TerminalQuestioner {
	const readline = createInterface({ input, output: stderr });

	return {
		close: () => {
			readline.close();
		},
		question: async (message) => {
			readline.pause();
			await flush();

			return await readline.question(message);
		},
	};
}

export { terminalQuestioner as default };
export type { TerminalQuestioner };
