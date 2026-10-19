import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { operatorStopRecord, operatorStopped } from "./operator-stop";
import { TestResources } from "./test-support";

describe(operatorStopRecord.name, () => {
	it("retains the saved stop record's historical bytes", () => {
		const record = operatorStopRecord("SIGTERM");

		expect(record).toBe(
			'{\n  "status": "OPERATOR_STOPPED",\n  "signal": "SIGTERM"\n}\n',
		);
	});
});

const resources = TestResources.forEachTest();

describe(operatorStopped.name, () => {
	it("retains the historical malformed stop record diagnostic", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stop-"));
		resources.track(directory);
		const operatorStopFile = join(directory, "stop.json");
		await Bun.write(operatorStopFile, "{}");

		const failure = await failureOf(operatorStopped({ operatorStopFile }));
		const digest = new Bun.CryptoHasher("sha256")
			.update(failure.message)
			.digest("hex");

		expect(digest).toBe(
			"3826edb313f0220145812b7527afa43b02e3dd6d3ff8cff83b75be8fc5963af3",
		);
	});
});
