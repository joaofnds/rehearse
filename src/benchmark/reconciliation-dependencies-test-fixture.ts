import type { ReconciliationDependencies } from "./run-reconciliation";

interface FakeDependencies {
	readonly artifactFiles: ReadonlySet<string>;
	readonly manifests: ReadonlyMap<string, { readonly sourceRoot: string }>;
	readonly markers: ReadonlyMap<string, { readonly pid: number }>;
	readonly alivePids: ReadonlySet<number>;
	readonly reportError: (message: string) => void;
}
class ReconciliationFixture {
	readonly #runsDirectory: string;
	readonly #overrides: Partial<FakeDependencies>;
	public constructor(
		runsDirectory: string,
		overrides: Partial<FakeDependencies> = {},
	) {
		this.#runsDirectory = runsDirectory;
		this.#overrides = overrides;
	}
	public build(): ReconciliationDependencies {
		const artifactFiles = this.#overrides.artifactFiles ?? new Set<string>();
		const manifests =
			this.#overrides.manifests ??
			new Map<string, { readonly sourceRoot: string }>();
		const markers =
			this.#overrides.markers ?? new Map<string, { readonly pid: number }>();
		const alivePids = this.#overrides.alivePids ?? new Set<number>();

		return {
			artifactExists: async (path: string) =>
				await Promise.resolve(artifactFiles.has(path)),
			isAlive: (pid: number) => alivePids.has(pid),
			loadManifest: async (path: string) =>
				await Promise.resolve(manifests.get(path)),
			readMarker: async (root: string) =>
				await Promise.resolve(markers.get(root)),
			reportError:
				this.#overrides.reportError ??
				((message: string) => {
					throw new Error(`unexpected reconciliation report: ${message}`);
				}),
			runsDirectory: this.#runsDirectory,
		};
	}
}
export { ReconciliationFixture as default };
