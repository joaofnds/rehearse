import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

const EXECUTABLE_FILE_MODE = 0o755;

interface ExternalCallTraps {
	readonly externalCallMarker: string;
	readonly trapsDirectory: string;
}

async function comparisonExternalCallTraps(
	root: string,
): Promise<ExternalCallTraps> {
	const trapsDirectory = join(root, "traps");
	const externalCallMarker = join(root, "unexpected-external-call");

	await mkdir(trapsDirectory);
	await Array.fromAsync(["claude", "git"], async (command) => {
		const trap = join(trapsDirectory, command);

		await Bun.write(
			trap,
			'#!/bin/sh\ntouch "$EXTERNAL_CALL_MARKER"\nexit 97\n',
		);
		await chmod(trap, EXECUTABLE_FILE_MODE);
	});

	return { externalCallMarker, trapsDirectory };
}

export { comparisonExternalCallTraps as default };
