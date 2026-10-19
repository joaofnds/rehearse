import { displayPath } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { groupRepReads } from "#benchmark/staleness-report";
import { UsageError } from "#cli/commands";
import { parseRecordId } from "#cli/record-id";
import { corpusSource } from "#server/api-source";
import type { ApiDependencies } from "#server/api-source";
import { redactAbsolutePaths } from "#server/redact-path";

interface GroupIdentityRequest {
	readonly runsDirectory: string;
	readonly groupId: string;
}

async function existingGroup({
	runsDirectory,
	groupId,
}: GroupIdentityRequest): Promise<string> {
	const id = parseRecordId(`group:${groupId}`);
	if (id.kind !== "group") {
		throw new UsageError(`${groupId} names no group`);
	}

	const { groupFile } = confirmationGroupPaths(runsDirectory, id.groupId);
	if (!(await Bun.file(groupFile).exists())) {
		throw new RefusedPreconditionError(
			`No record group:${id.groupId} at ${displayPath(groupFile)}`,
		);
	}

	return id.groupId;
}

type GroupReading = Awaited<ReturnType<typeof groupRepReads>>;

async function groupReading(
	dependencies: ApiDependencies,
	groupId: string,
): Promise<GroupReading> {
	const existing = await existingGroup({
		groupId,
		runsDirectory: dependencies.runsDirectory,
	});
	const reads = await groupRepReads(
		dependencies.runsDirectory,
		existing,
		await corpusSource(dependencies),
	);

	return { ...reads, reasons: reads.reasons.map(redactAbsolutePaths) };
}

export { groupReading as default };
