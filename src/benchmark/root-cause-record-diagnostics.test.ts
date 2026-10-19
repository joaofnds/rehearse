import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { RUN, runWithOneGradedStage } from "./root-cause-analysis-test-support";
import { assembleRootCauseBundle } from "./root-cause-bundle";
import RootCauseBundleWorkspace from "./root-cause-bundle-workspace-test-fixture";
import { benchmarkRunPaths } from "./run-layout";
import { TestResources } from "./test-support";

const workspace = new RootCauseBundleWorkspace(TestResources.forEachTest());
interface MalformedBundleRecord {
	readonly kind: string;
	readonly json: string;
	readonly digest: string;
	readonly name: string;
}
const malformedBundleRecords = [
	{
		digest: "cef97a5fa3d168dec098b442668e6ad366072d3878d8e899a11f8cf235e51a05",
		json: '{"status":7,"grade":7}',
		kind: "stage",
		name: "stage",
	},
	{
		digest: "cb18b5e4b663eee5b7a9d9e9910cb6cc4f4942790ca59f8e5bd1d90f32dde95c",
		json: '{"input":{"commitSubjects":7,"changedPaths":7}}',
		kind: "stage",
		name: "stage input",
	},
	{
		digest: "bde260c91373836a6003e69c5058bb364fcdc4d7f5d55543387ed3e420e819ed",
		json: '{"status":7,"grade":7}',
		kind: "final",
		name: "final",
	},
	{
		digest: "98120242706cb305efd2926b34cb49d9591d1c0994f54e629d63e1f304f8b840",
		json: '{"status":"COMPLETE","grade":{"verdict":7,"summary":7}}',
		kind: "final",
		name: "final grade",
	},
];
const rejectsMalformedBundleRecord = async ({
	kind,
	json,
	digest,
}: MalformedBundleRecord): Promise<void> => {
	const directory = await workspace.createDirectory();
	await runWithOneGradedStage(directory);
	const paths = benchmarkRunPaths(directory, RUN);
	const file = kind === "stage" ? paths.stageFile("shape") : paths.artifactFile;
	await Bun.write(file, json);

	const failure = await failureOf(assembleRootCauseBundle(directory, RUN));

	expect(
		new Bun.CryptoHasher("sha256").update(failure.message).digest("hex"),
	).toBe(digest);
};
describe("historical root-cause record diagnostics", () => {
	it.each(malformedBundleRecords)(
		"preserves historical malformed $name record diagnostics",
		rejectsMalformedBundleRecord,
	);
});
