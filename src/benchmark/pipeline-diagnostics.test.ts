import { describe, expect, it } from "bun:test";

import { PipelineDefinitionError, parsePipeline } from "./pipeline";

interface PipelineDiagnosticExample {
	readonly json: string;
	readonly message: string;
	readonly name: string;
}

function rejectsWithHistoricalPipelineDiagnostic({
	json,
	message,
}: PipelineDiagnosticExample): void {
	expect(() => parsePipeline(json, [])).toThrow(
		new PipelineDefinitionError(message),
	);
}

const invalidPipelineDiagnosticPriorityExamples = [
	{
		json: "{}",
		message:
			"Pipeline definition has an invalid statuses: Invalid input: expected array, received undefined",
		name: "statuses before stages",
	},
	{
		json: '{"statuses":["Done"],"target":{},"stages":[]}',
		message:
			"Pipeline definition has an invalid target: Invalid input: expected array, received undefined",
		name: "target before stages",
	},
	{
		json: '{"stages":[{"kind":"planning","name":"plan","rubric":"rubric","skill":"shape"}],"statuses":["Done"],"target":{"services":[{"exports":{},"image":false,"name":1,"port":0,"ready":[]}],"checks":[],"setup":[],"integrityFiles":[]}}',
		message:
			"Pipeline definition has an invalid target: Invalid input: expected string, received number",
		name: "target service name before other service and target fields",
	},
	{
		json: '{"stages":[{"kind":"planning","name":"bad/name","rubric":0,"skill":"bad skill","artifact":1}],"statuses":["Done"],"target":{"checks":[{"command":["true"]}],"integrityFiles":["package.json"]}}',
		message:
			"Pipeline stage bad/name has an invalid name: must be letters, digits, dashes, or underscores",
		name: "stage name before artifact and skill",
	},
	{
		json: '{"stages":[{"kind":"planning","name":"plan","rubric":"rubric","skill":0,"artifact":1},{"kind":"planning","name":0,"rubric":"rubric","skill":"shape"}],"statuses":["Done"],"target":{"checks":[{"command":["true"]}],"integrityFiles":["package.json"]}}',
		message:
			"Pipeline stage plan has an invalid skill: Invalid input: expected string, received number",
		name: "first stage before earlier field in later stage",
	},
	{
		json: '{"stages":[{"kind":"planning","name":"stage-0","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-1","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"plan","rubric":"rubric","skill":0},{"kind":"planning","name":"stage-3","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-4","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-5","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-6","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-7","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-8","rubric":"rubric","skill":"shape"},{"kind":"planning","name":"stage-9","rubric":"rubric","skill":"shape"},{"kind":"planning","name":0,"rubric":"rubric","skill":"shape"}],"statuses":["Done"],"target":{"checks":[{"command":["true"]}],"integrityFiles":["package.json"]}}',
		message:
			"Pipeline stage plan has an invalid skill: Invalid input: expected string, received number",
		name: "numeric stage positions before field priority",
	},
];

describe("pipeline diagnostic priority", () => {
	it.each(invalidPipelineDiagnosticPriorityExamples)(
		"keeps historical diagnostic priority for $name",
		rejectsWithHistoricalPipelineDiagnostic,
	);
});
