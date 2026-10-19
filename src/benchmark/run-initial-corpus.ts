import { runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import { liveCorpusSource, readCorpusInstructions } from "./corpus-file";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion } from "./corpus-version";

interface InitialRunCorpus {
	readonly source: CorpusRoot;
	readonly instructions: string;
	readonly claudeVersion: string;
	readonly version: CorpusMeasurement;
}
async function measureInitialRunCorpus(
	runsDirectory: string,
): Promise<InitialRunCorpus> {
	const source = liveCorpusSource();
	const [instructions, claudeVersion, version] = await Promise.all([
		readCorpusInstructions(source),
		runCommand(["claude", "--version"], CONTROL_DIR),
		measureCorpusVersion(runsDirectory, source),
	]);
	return { claudeVersion, instructions, source, version };
}
export { measureInitialRunCorpus as default };
export type { InitialRunCorpus };
