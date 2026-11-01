import { describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import usePipelineCheckpoints from "./comparison-pipeline-evidence-test-fixtures";
import { parseConfirmationRepRecord } from "./confirmation-record";

const FIRST_REP = 1;

interface FinalSourceLink {
	readonly kind: "file" | "directory";
	readonly repFile: string;
}

async function linkExternalFinal({
	kind,
	repFile,
}: FinalSourceLink): Promise<void> {
	const repRoot = dirname(repFile);
	const finalFile = join(repRoot, "final.json");
	const externalRoot = await copyFinalOutside(repRoot);
	await rm(finalFile);
	if (kind === "file") {
		await symlink(join(externalRoot, "final.json"), finalFile);
		return;
	}

	await symlink(externalRoot, join(repRoot, "linked"));
	await pointFinalRecord(repFile);
}

async function copyFinalOutside(repRoot: string): Promise<string> {
	const externalRoot = join(dirname(repRoot), "external-final");
	await mkdir(externalRoot);
	await Bun.write(
		join(externalRoot, "final.json"),
		await Bun.file(join(repRoot, "final.json")).text(),
	);

	return externalRoot;
}

async function pointFinalRecord(repFile: string): Promise<void> {
	const record = parseConfirmationRepRecord(await Bun.file(repFile).text());
	if (record.finalOutcome.status !== "JUDGED") {
		throw new Error("fixture final judgment missing");
	}
	await Bun.write(
		repFile,
		JSON.stringify({
			...record,
			finalOutcome: {
				...record.finalOutcome,
				evidence: {
					...record.finalOutcome.evidence,
					recordFile: "linked/final.json",
				},
			},
		}),
	);
}

describe("comparison Judge source destination", () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("refuses an escaping stage scorecard symlink", async () => {
		const repRoot = dirname(fixture.repFile("case-1", "candidate", FIRST_REP));
		const scorecard = join(repRoot, "stages", "build.json");
		const external = join(dirname(repRoot), "external-stage.json");
		await Bun.write(external, await Bun.file(scorecard).text());
		await rm(scorecard);
		await symlink(external, scorecard);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"evidence path must remain inside its source directory",
		);
	});

	it.each(["file", "directory"] as const)(
		"refuses an escaping final evidence %s symlink",
		async (kind) => {
			await usePipelineCheckpoints(fixture);
			await linkExternalFinal({
				kind,
				repFile: fixture.repFile("case-1", "candidate", FIRST_REP),
			});

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"evidence path must remain inside its source directory",
			);
		},
	);
});
