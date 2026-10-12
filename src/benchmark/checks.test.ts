import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	captureBaselineContext,
	captureCheckIntegrity,
	captureFileHashes,
	captureTreatmentChecks,
	runSetup,
	runChecks,
} from "./checks";
import { runCommand } from "./command";
import { MAX_CONTEXT_FILE_BYTES } from "./config";
import { captureBuildCandidate } from "./target";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();

const ignoreLog = (): undefined => undefined;

describe(runChecks.name, () => {
	it("runs declared checks in order with overlaid environments", async () => {
		const source = await testResources.createRepository();
		const script = [
			"const path = 'checks.log';",
			"const previous = await Bun.file(path).exists() ? await Bun.file(path).text() : '';",
			String.raw`await Bun.write(path, previous + Bun.env.CHECK_VALUE + ':' + Bun.env.PATH + ':' + (Bun.env.HOME === undefined ? 'missing' : 'host') + '\n');`,
		].join(" ");

		await runChecks(
			source.directory,
			"Custom checks",
			[
				{
					command: [process.execPath, "-e", script],
					env: { CHECK_VALUE: "first", PATH: "first-path" },
				},
				{
					command: [process.execPath, "-e", script],
					env: { CHECK_VALUE: "second", PATH: "second-path" },
				},
			],
			ignoreLog,
		);

		expect(await Bun.file(join(source.directory, "checks.log")).text()).toBe(
			"first:first-path:host\nsecond:second-path:host\n",
		);
	});

	it("announces the label through the caller's writer", async () => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runChecks(
			source.directory,
			"Custom checks",
			[{ command: ["bun", "--version"] }],
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nCustom checks"]);
	});
});

describe(captureTreatmentChecks.name, () => {
	it("passes when every declared command succeeds", async () => {
		const source = await testResources.createRepository();
		const checks = [
			{ command: ["bun", "-e", "process.exit(0)"] },
			{ command: ["bun", "--version"] },
		];

		const result = await captureTreatmentChecks(
			source.directory,
			checks,
			ignoreLog,
		);

		expect(result).toEqual({
			status: "PASS",
			evidence: [
				{
					source: "local-checks",
					path: checks.map(({ command }) => command.join(" ")).join("; "),
					claim: "All treatment checks exited successfully",
				},
			],
		});
	});

	it("names the failed declared command in authoritative evidence", async () => {
		const source = await testResources.createRepository();
		const command = ["bun", "-e", "process.exit(7)"];
		const written: string[] = [];

		const result = await captureTreatmentChecks(
			source.directory,
			[{ command }],
			(message) => {
				written.push(message);
			},
		);

		expect(result).toEqual({
			status: "FAIL",
			evidence: [
				{
					source: "local-checks",
					path: command.join(" "),
					claim: "Treatment check exited 7",
				},
			],
		});
		expect(written).toEqual([
			"\nTreatment checks",
			"Treatment check failed: bun -e process.exit(7) exited 7",
		]);
	});

	it("names a declared command that cannot be launched", async () => {
		const source = await testResources.createRepository();
		const command = ["act-15-command-does-not-exist"];
		const written: string[] = [];

		const result = await captureTreatmentChecks(
			source.directory,
			[{ command }],
			(message) => {
				written.push(message);
			},
		);

		expect(result.evidence[0]).toEqual({
			source: "local-checks",
			path: command.join(" "),
			claim: "Treatment check exited unknown",
		});
		expect(written).toEqual([
			"\nTreatment checks",
			"Treatment check failed: act-15-command-does-not-exist exited unknown",
		]);
	});

	it("announces its label through the caller's writer", async () => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await captureTreatmentChecks(
			source.directory,
			[{ command: ["bun", "--version"] }],
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nTreatment checks"]);
	});
});

describe(runSetup.name, () => {
	it("announces its label through the caller's writer", async () => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runSetup(
			source.directory,
			[{ command: ["bun", "--version"] }],
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nTarget setup"]);
	});

	it("announces nothing when the target declares no setup", async () => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runSetup(source.directory, undefined, (message) => {
			written.push(message);
		});

		expect(written).toEqual([]);
	});
});

describe(captureFileHashes.name, () => {
	it("rejects a declared integrity file missing at baseline", async () => {
		const source = await testResources.createRepository();

		expect(
			captureFileHashes(source.directory, ["missing.json"]),
		).rejects.toThrow(/missing\.json/u);
	});
});

describe(captureCheckIntegrity.name, () => {
	it("passes when declared files are unchanged and ignores undeclared files", async () => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "declared.json"), "declared\n");
		await Bun.write(join(source.directory, "undeclared.json"), "before\n");
		const baselineHashes = await captureFileHashes(source.directory, [
			"declared.json",
		]);
		await Bun.write(join(source.directory, "undeclared.json"), "after\n");

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		expect(result.status).toBe("PASS");
		expect(result.evidence[0]?.path).toBe("declared.json");
	});

	it("fails with every changed or deleted declared path", async () => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "package.json"), "");
		const baselineHashes = await captureFileHashes(source.directory, [
			"package.json",
			"base.txt",
		]);
		await rm(join(source.directory, "package.json"));
		await Bun.write(join(source.directory, "base.txt"), "changed\n");

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		expect(result.status).toBe("FAIL");
		expect(result.evidence[0]?.claim).toContain("package.json, base.txt");
	});

	it("fails when a candidate weakens a check definition", async () => {
		const source = await testResources.createRepository();
		const baselineHashes = await captureFileHashes(source.directory, [
			"package.json",
		]);
		await Bun.write(
			join(source.directory, "package.json"),
			'{"scripts":{"typecheck":"true","check":"true","test:unit":"true"}}\n',
		);

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		expect(result.status).toBe("FAIL");
		expect(result.evidence[0]?.claim).toContain("package.json");
	});
});

describe(captureBuildCandidate.name, () => {
	it("freezes untracked Build files", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "uncommitted.ts"),
			"export const uncommitted = true;\n",
		);

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.changedPaths).toContain("uncommitted.ts");
		expect(candidate.diff).toContain("export const uncommitted = true;");
	});

	it("omits untracked content beyond the capture limit", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "huge.log"),
			"y".repeat(MAX_CONTEXT_FILE_BYTES + 1),
		);

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.changedPaths).toContain("huge.log");
		expect(candidate.diff).toContain("bytes omitted");
		expect(candidate.diff).not.toContain("yyyy");
	});

	it("summarizes committed binary changes instead of embedding them", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "asset.bin"),
			new Uint8Array([137, 80, 78, 71, 0, 13, 10, 26]),
		);
		await commitAll(source.directory, "feat: add binary asset");

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.diff).toContain("Binary files");
		expect(candidate.diff).not.toContain("GIT binary patch");
	});
});

describe(captureBaselineContext.name, () => {
	it("captures every tracked file except the lockfile", async () => {
		const source = await testResources.createRepository();

		const tracked = await runCommand(["git", "ls-files"], source.directory);
		const context = await captureBaselineContext(source.directory);

		expect(tracked).toContain("bun.lock");
		expect(context.map(({ path }) => path).toSorted()).toEqual([
			".gitignore",
			"base.txt",
			"package.json",
		]);
	});

	it("replaces files beyond the per-file capture limit with an omission marker", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "huge.txt"),
			"x".repeat(MAX_CONTEXT_FILE_BYTES + 1),
		);
		await commitAll(source.directory, "chore: huge file");

		const context = await captureBaselineContext(source.directory);
		const huge = context.find(({ path }) => path === "huge.txt");

		expect(huge?.content).toContain("bytes omitted");
		expect(huge?.content).not.toContain("xxxx");
	});

	it("replaces binary files with a binary marker", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "image.bin"),
			new Uint8Array([137, 80, 78, 71, 0, 13, 10, 26]),
		);
		await commitAll(source.directory, "chore: binary file");

		const context = await captureBaselineContext(source.directory);
		const binary = context.find(({ path }) => path === "image.bin");

		expect(binary?.content).toBe("[binary file omitted]");
	});
});
