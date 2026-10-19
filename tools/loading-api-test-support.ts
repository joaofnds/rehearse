import { afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INITIAL_API_DATA_VERSION = 1;
const API_DATA_VERSION_INCREMENT = 1;
const RESOURCE_DRAIN_START_INDEX = 0;

interface VersionedLoadingApi {
	readonly base: string;
	readonly changeData: () => void;
	readonly saveBaseline: (output: string) => Promise<string>;
}

class LoadingApiResources {
	private readonly directories: string[] = [];
	private readonly servers: Bun.Server<undefined>[] = [];

	public static forEachTest(): LoadingApiResources {
		const resources = new LoadingApiResources();
		afterEach(async () => {
			await resources.cleanup();
		});
		return resources;
	}

	public async create(
		changedPath: string | null = null,
	): Promise<VersionedLoadingApi> {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-loading-benchmark-"),
		);
		this.directories.push(directory);
		let version = INITIAL_API_DATA_VERSION;
		const server = Bun.serve({
			fetch(request) {
				const { pathname } = new URL(request.url);
				return Response.json({
					path: pathname,
					version:
						changedPath === null || pathname === changedPath
							? version
							: INITIAL_API_DATA_VERSION,
				});
			},
			hostname: "127.0.0.1",
			port: 0,
		});
		this.servers.push(server);
		return {
			base: server.url.href,
			changeData() {
				version += API_DATA_VERSION_INCREMENT;
			},
			async saveBaseline(output) {
				const file = join(directory, "baseline.json");
				await writeFile(file, output);
				return file;
			},
		};
	}

	private async cleanup(): Promise<void> {
		await Promise.all(
			this.servers.splice(RESOURCE_DRAIN_START_INDEX).map(async (server) => {
				await server.stop(true);
			}),
		);
		await Promise.all(
			this.directories
				.splice(RESOURCE_DRAIN_START_INDEX)
				.map(async (directory) => {
					await rm(directory, { force: true, recursive: true });
				}),
		);
	}
}

export { LoadingApiResources as default };
