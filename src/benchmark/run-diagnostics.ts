interface RunDiagnostics {
	readonly reportError: (message: string) => void;
	readonly flush: () => Promise<void>;
}

async function writeDiagnosticAfter(
	previous: Promise<void>,
	message: string,
): Promise<void> {
	await previous;
	await Bun.write(Bun.stderr, `${message}\n`);
}

function liveRunDiagnostics(): RunDiagnostics {
	let pendingWrites = Promise.resolve();

	return {
		flush: async () => {
			await pendingWrites;
		},
		reportError: (message) => {
			pendingWrites = writeDiagnosticAfter(pendingWrites, message);
		},
	};
}

interface RunProgress {
	readonly log: (message: string) => void;
	readonly flush: () => Promise<void>;
}

async function flushRunDiagnostics(
	diagnostics: RunDiagnostics,
	progress: RunProgress,
): Promise<void> {
	try {
		await diagnostics.flush();
	} finally {
		await progress.flush();
	}
}

export { liveRunDiagnostics, flushRunDiagnostics };
export type { RunDiagnostics, RunProgress };
