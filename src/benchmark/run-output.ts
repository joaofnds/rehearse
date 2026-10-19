import { flushRunDiagnostics, liveRunDiagnostics } from "./run-diagnostics";
import type { RunDiagnostics, RunProgress } from "./run-diagnostics";

class RunOutput {
	public readonly log: (message: string) => void;
	public readonly diagnostics: RunDiagnostics;
	public constructor(private readonly progress: RunProgress) {
		this.log = progress.log;
		this.diagnostics = liveRunDiagnostics();
	}
	public writeProgress(message: string): void {
		const { log } = this;
		log(message);
	}
	public readonly reportError = async (message: string): Promise<void> => {
		this.diagnostics.reportError(message);
		await this.diagnostics.flush();
	};
	public readonly flush = async (): Promise<void> => {
		await flushRunDiagnostics(this.diagnostics, this.progress);
	};
}
export { RunOutput as default };
