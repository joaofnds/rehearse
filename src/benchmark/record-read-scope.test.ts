import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestResources } from "./test-support";
import { recordFileText, withRecordReadScope } from "./record-read-scope";

describe(withRecordReadScope.name, () => {
	const resources = TestResources.forEachTest();

	it("reuses a reading inside a report and sees replacement bytes in the next report", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-record-reads-"));
		resources.track(root);
		const file = join(root, "record.json");
		await Bun.write(file, "before");

		const repeated = await withRecordReadScope(async () => {
			await recordFileText(file);
			await Bun.write(file, "after");
			return withRecordReadScope(() => recordFileText(file));
		});
		const next = await withRecordReadScope(() => recordFileText(file));

		expect(repeated).toBe("before");
		expect(next).toBe("after");
	});
});
