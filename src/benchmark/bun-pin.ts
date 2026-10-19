import { REQUIRED_BUN_VERSION } from "./config";

function pinnedBunRefusal(versions: {
	readonly required: string;
	readonly running: string;
}): string | null {
	if (versions.running === versions.required) {
		return null;
	}

	return `Use Bun ${versions.required}; current version is ${versions.running}`;
}

function assertPinnedBunVersion(required: string = REQUIRED_BUN_VERSION): void {
	const refusal = pinnedBunRefusal({ required, running: Bun.version });
	if (refusal !== null) {
		throw new Error(refusal);
	}
}

export { pinnedBunRefusal, assertPinnedBunVersion };
