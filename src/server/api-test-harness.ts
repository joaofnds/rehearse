import type ApiHttpDriver from "#server/api-test-http-driver";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import type { ApiTestOptions } from "#server/api-test-workspace";

class ApiTestHarness {
	private constructor(
		private readonly workspace: Readonly<ApiTestWorkspace>,
		public readonly driver: ApiHttpDriver,
	) {}

	public static async setup(options: ApiTestOptions): Promise<ApiTestHarness> {
		const workspace = new ApiTestWorkspace();
		workspace.track(options.runsDirectory);
		const driver = await workspace.start(options);

		return new ApiTestHarness(workspace, driver);
	}

	public async teardown(): Promise<void> {
		await this.workspace.dispose();
	}
}

export { ApiTestHarness as default };
