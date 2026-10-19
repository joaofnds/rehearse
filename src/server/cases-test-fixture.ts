import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { CONTROL_DIR } from "#benchmark/config";
import {
	CASE_ID,
	RecordedRunsFixture,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import CaseCatalogExamples from "./case-catalog-test-examples";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "./launch-test-support";
import createLaunchApp from "./launches";

const FIRST_CASE_RUBRIC_INDEX = 0;

const SECOND_CASE_RUBRIC_INDEX = 1;

const RESOURCE_DRAIN_START_INDEX = 0;

const { pipeline: PIPELINE_CASE, session: SESSION_CASE } =
	CaseCatalogExamples.caseListing();

const UNRUNNABLE_CASE = {
	...PIPELINE_CASE,
	id: "unrunnable",
	title: "A case whose pipeline names a missing rubric",
};

const UNFIT_RUBRIC_CASE = {
	...PIPELINE_CASE,
	id: "unfit-rubric",
	title: "A case whose build rubric does not fit its stage",
};

const ESCAPING_PIPELINE_CASE = {
	...PIPELINE_CASE,
	id: "escaping-pipeline",
	pipeline: `../${CASE_ID}/pipeline.json`,
	title: "A case whose pipeline path leaves its directory",
};

const ESCAPING_RUBRICS_CASE = {
	...PIPELINE_CASE,
	id: "escaping-rubrics",
	rubrics: `../${CASE_ID}/rubrics`,
	title: "A case whose rubrics path leaves its directory",
};

const PLANNING_RUBRIC = join(CONTROL_DIR, "cases/audit-log/rubrics/shape.json");

const DELIVERY_RUBRIC = join(CONTROL_DIR, "cases/audit-log/rubrics/build.json");

function pipelineFile(caseId: string, rubrics: readonly string[]): string {
	return JSON.stringify({
		stages: [
			{
				kind: "planning",
				name: "discuss",
				requiresAcceptanceCriteria: false,
				rubric: `cases/${caseId}/rubrics/${rubrics[FIRST_CASE_RUBRIC_INDEX]}`,
				skill: "discuss",
			},
			{
				kind: "delivery",
				name: "build",
				rubric: `cases/${caseId}/rubrics/${rubrics[SECOND_CASE_RUBRIC_INDEX]}`,
				skill: "build",
			},
		],
		statuses: ["To Do", "Done"],
		target: {
			checks: [{ command: ["bun", "run", "typecheck"] }],
			integrityFiles: ["package.json"],
		},
	});
}

const listedCaseSchema = z.object({ id: z.string() }).loose();

const unreadableCaseSchema = z.object({ id: z.string(), reason: z.string() });

const listingSchema = z.object({
	cases: z.array(listedCaseSchema),
	unreadable: z.array(unreadableCaseSchema),
	unreadableRecords: z.array(unreadableCaseSchema),
});

type Listing = z.infer<typeof listingSchema>;

type Listed = Listing["cases"][number];

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function casesRoot(): Promise<string> {
	const root = await temporaryDirectory("rehearse-cases-");
	await writeCaseDeclarations(root);
	await Bun.write(
		join(root, UNFIT_RUBRIC_CASE.id, "rubrics", "build.json"),
		"{}",
	);
	await Bun.write(
		join(root, UNFIT_RUBRIC_CASE.id, "pipeline.json"),
		pipelineFile(UNFIT_RUBRIC_CASE.id, ["discuss.json", "build.json"]),
	);
	await Bun.write(
		join(root, CASE_ID, "pipeline.json"),
		pipelineFile(CASE_ID, ["discuss.json", "build.json"]),
	);
	await Bun.write(
		join(root, ESCAPING_RUBRICS_CASE.id, "pipeline.json"),
		pipelineFile(ESCAPING_RUBRICS_CASE.id, ["discuss.json", "build.json"]),
	);
	await Bun.write(
		join(root, UNRUNNABLE_CASE.id, "pipeline.json"),
		pipelineFile(UNRUNNABLE_CASE.id, ["discuss.json", "missing.json"]),
	);
	await writeCaseDocuments(root);

	return root;
}

interface Serving {
	readonly casesDirectory: string;
	readonly fixture: RecordedRunsFixture;
	readonly list: () => Promise<Listing>;
	readonly listed: (id: string) => Promise<Listed | undefined>;
}

async function serving(): Promise<Serving> {
	const runsDirectory = await temporaryDirectory("rehearse-cases-runs-");
	const casesDirectory = await casesRoot();
	const app = createLaunchApp({
		casesRoot: casesDirectory,
		home: runsDirectory,
		launcher: new FakeLauncher(),
		liveCorpus: () => directoryLiveCorpus(runsDirectory),
		liveness: nothingRunning,
		now: () => new Date(FAKE_LAUNCH_TIME),
		runsDirectory,
	});
	const list = async (): Promise<Listing> => {
		const response = await app.request("/api/cases");

		return listingSchema.parse(await response.json());
	};

	return {
		casesDirectory,
		fixture: new RecordedRunsFixture(runsDirectory),
		list,
		listed: async (id) => {
			const { cases } = await list();

			return cases.find((listed) => listed.id === id);
		},
	};
}

async function clearCaseRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function writeCaseDeclarations(root: string): Promise<void> {
	await Array.fromAsync(
		[
			PIPELINE_CASE,
			SESSION_CASE,
			UNRUNNABLE_CASE,
			UNFIT_RUBRIC_CASE,
			ESCAPING_PIPELINE_CASE,
			ESCAPING_RUBRICS_CASE,
		],
		async (declaration) => {
			await mkdir(join(root, declaration.id, "rubrics"), { recursive: true });
			await Bun.write(
				join(root, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
			await Bun.write(
				join(root, declaration.id, "rubrics", "discuss.json"),
				await Bun.file(PLANNING_RUBRIC).text(),
			);
			await Bun.write(
				join(root, declaration.id, "rubrics", "build.json"),
				await Bun.file(DELIVERY_RUBRIC).text(),
			);
		},
	);
}

async function writeCaseDocuments(root: string): Promise<void> {
	await Bun.write(join(root, CASE_ID, "task.md"), "Add the audit log module.");
	await Bun.write(join(root, CASE_ID, "brief.md"), "Keep an audit trail.");
	await Bun.write(
		join(root, CASE_ID, "final-rubric.md"),
		"The audit trail is complete.",
	);
}

export {
	PIPELINE_CASE,
	serving,
	temporaryDirectory,
	SESSION_CASE,
	UNRUNNABLE_CASE,
	UNFIT_RUBRIC_CASE,
	ESCAPING_PIPELINE_CASE,
	ESCAPING_RUBRICS_CASE,
	clearCaseRoots,
};
