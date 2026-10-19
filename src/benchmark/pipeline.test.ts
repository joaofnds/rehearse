import { describe, expect, it } from "bun:test";
import { join, relative } from "node:path";

import type { PipelineDefinition, TargetService } from "./pipeline";
import { loadPipeline } from "./pipeline";
import { parseStageRubric } from "./stage-rubric";
import { PROJECT_ROOT, TestResources } from "./test-support";

const AUDIT_LOG_CASE = "cases/audit-log";

const testResources = TestResources.forEachTest();

function declaredService(
	definition: PipelineDefinition,
	name: string,
): TargetService {
	const service = definition.target.services?.find(
		(each) => each.name === name,
	);
	if (service === undefined) {
		throw new Error(`The pipeline declares no ${name} service`);
	}

	return service;
}

async function loadDefaultPipeline(): Promise<PipelineDefinition> {
	return await loadPipeline(
		`${AUDIT_LOG_CASE}/pipelines/default.json`,
		`${AUDIT_LOG_CASE}/rubrics`,
	);
}

const theDefaultPipelinePlansTheTaskBeforeBuildingIt =
	async (): Promise<void> => {
		const definition = await loadDefaultPipeline();

		expect(definition.stages.map(({ name }) => name)).toEqual([
			"shape",
			"build",
		]);
	};

const theDefaultPipelineDeclaresTheNestJSTargetSetupChecksAndIntegrityFiles =
	async (): Promise<void> => {
		const definition = await loadDefaultPipeline();
		const env = { CONFIG_PATH: "src/config/test.yaml" };

		const { services: _services, ...target } = definition.target;

		expect(target).toEqual({
			checks: [
				{ command: ["bun", "run", "typecheck"], env },
				{ command: ["bun", "run", "check"], env },
				{ command: ["bun", "run", "test:unit"], env },
			],
			integrityFiles: ["package.json", "tsconfig.json", "biome.json"],
			setup: [
				{ command: ["bun", "install", "--frozen-lockfile"] },
				{ command: ["bun", "run", "migrate", "up"], env },
			],
		});
	};

const theDefaultPipelineStartsTheDatabaseAndCacheTheTargetsTestsReach =
	async (): Promise<void> => {
		const definition = await loadDefaultPipeline();

		const services = definition.target.services?.map(({ name, exports }) => ({
			exports: Object.keys(exports),
			name,
		}));

		expect(services).toEqual([
			{ exports: ["DATABASE_URL"], name: "postgres" },
			{ exports: ["REDIS_URL"], name: "redis" },
		]);
	};

const theDefaultPipelineGivesTheDatabaseAddressTheCredentialsTheDatabaseIsCreatedWith =
	async (): Promise<void> => {
		const postgres = declaredService(await loadDefaultPipeline(), "postgres");

		const {
			POSTGRES_USER: user = "",
			POSTGRES_PASSWORD: password = "",
			POSTGRES_DB: database = "",
		} = postgres.env ?? {};

		expect(postgres.exports).toEqual({
			DATABASE_URL: `postgres://${user}:${password}@127.0.0.1:{port}/${database}`,
		});
	};

const theDefaultPipelineNamesARubricThatParsesForEveryDeclaredStage =
	async (): Promise<void> => {
		const definition = await loadDefaultPipeline();

		await Array.fromAsync(definition.stages, async (stage) => {
			const content = await Bun.file(join(PROJECT_ROOT, stage.rubric)).text();
			expect(() => parseStageRubric(content, stage.kind)).not.toThrow();
		});
	};

describe("the default pipeline", () => {
	it(
		"shapes the task before building it",
		theDefaultPipelinePlansTheTaskBeforeBuildingIt,
	);

	it(
		"declares the NestJS target setup, checks and integrity files",
		theDefaultPipelineDeclaresTheNestJSTargetSetupChecksAndIntegrityFiles,
	);

	it(
		"starts the database and cache the target's tests reach",
		theDefaultPipelineStartsTheDatabaseAndCacheTheTargetsTestsReach,
	);

	it(
		"gives the database address the credentials the database is created with",
		theDefaultPipelineGivesTheDatabaseAddressTheCredentialsTheDatabaseIsCreatedWith,
	);

	it(
		"names a rubric that parses for every declared stage",
		theDefaultPipelineNamesARubricThatParsesForEveryDeclaredStage,
	);
});

const loadPipelineRefusesADefinitionOutsideTheControlRepository = (): void => {
	expect(
		loadPipeline("../../../../etc/hosts", `${AUDIT_LOG_CASE}/rubrics`),
	).rejects.toThrow(/outside/u);
};

const loadPipelineRejectsADeliveryStageWhoseRubricLacksTheHarnessBlockers =
	async (): Promise<void> => {
		const directory = await testResources.createControlDirectory();
		const absolute = join(directory, "invalid.json");
		const path = relative(PROJECT_ROOT, absolute);
		await Bun.write(
			absolute,
			JSON.stringify({
				stages: [
					{
						kind: "delivery",
						name: "ship",
						rubric: `${AUDIT_LOG_CASE}/rubrics/shape.json`,
						skill: "build",
					},
				],
				statuses: ["To Do", "Done"],
				target: {
					checks: [{ command: ["bun", "run", "check"] }],
					integrityFiles: ["package.json"],
				},
			}),
		);

		expect(loadPipeline(path, `${AUDIT_LOG_CASE}/rubrics`)).rejects.toThrow(
			/ship/u,
		);
	};

describe(loadPipeline.name, () => {
	it(
		"refuses a definition outside the control repository",
		loadPipelineRefusesADefinitionOutsideTheControlRepository,
	);

	it(
		"rejects a delivery stage whose rubric lacks the harness blockers",
		loadPipelineRejectsADeliveryStageWhoseRubricLacksTheHarnessBlockers,
	);
});
