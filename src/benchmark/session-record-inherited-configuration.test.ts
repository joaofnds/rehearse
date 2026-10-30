import { describe, expect, it } from "bun:test";

import { frozenInputsSchema } from "./confirmation-group-input-schema";
import { sessionSetupRecordSchema } from "./session-record-context-schema";

const SHA256_HEX_DIGITS = 64;
const GIT_SHA_HEX_CHARACTERS = 40;
const DIGEST = "0".repeat(SHA256_HEX_DIGITS);

const ACTUAL_SETUP_BEFORE_THE_FIELD = {
	hookEvents: [],
	kind: "actual",
	mcpConfigSha256: DIGEST,
	mcpServers: [],
	plugins: [],
	settingsKeys: [],
	settingsSha256: DIGEST,
};

const GROUP_INPUTS_BEFORE_THE_FIELD = {
	files: [{ kind: "pipeline", path: "pipeline.json", sha256: DIGEST }],
	judgeModel: "sonnet",
	lineage: { kind: "SOURCE", sha: "a".repeat(GIT_SHA_HEX_CHARACTERS) },
	model: "sonnet",
	pipelinePath: "pipeline.json",
	sessionBudgetUsd: 1,
};

describe("a session setup record's inherited configuration", () => {
	it("reads as unknown on a record written before it was recorded", () => {
		const setup = sessionSetupRecordSchema.parse({ kind: "isolated" });

		expect(setup.inheritedConfiguration).toBeUndefined();
	});

	it("reads as unknown on an actual setup written before it was recorded", () => {
		const setup = sessionSetupRecordSchema.parse(ACTUAL_SETUP_BEFORE_THE_FIELD);

		expect(setup.inheritedConfiguration).toBeUndefined();
	});

	it("reads as none on a record that inherited nothing", () => {
		const setup = sessionSetupRecordSchema.parse({
			inheritedConfiguration: [],
			kind: "isolated",
		});

		expect(setup.inheritedConfiguration).toEqual([]);
	});
});

describe("a confirmation group's inherited configuration", () => {
	it("reads as unknown on a group written before it was recorded", () => {
		const inputs = frozenInputsSchema.parse(GROUP_INPUTS_BEFORE_THE_FIELD);

		expect(inputs.inheritedConfiguration).toBeUndefined();
	});
});
