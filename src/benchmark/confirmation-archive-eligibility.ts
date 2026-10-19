import { realpath } from "node:fs/promises";
import { join } from "node:path";

import {
	ConfirmationArchiveRefusalError,
	validGroupId,
} from "./confirmation-archive-contract";
import type { ConfirmationArchiveTarget } from "./confirmation-archive-contract";
import { directory, exists, regularFile } from "./confirmation-archive-storage";
import { stoppedBeforeGroupRecord } from "./operator-stop";
import { confirmationGroupPaths } from "./run-layout";
import type { ConfirmationGroupPaths } from "./run-layout";

const NOT_FOUND = 404;
const CONFLICT = 409;

async function hasConfirmationSummary(
	target: ConfirmationArchiveTarget,
): Promise<boolean> {
	const root = await realpath(target.runsDirectory);
	return await exists(
		confirmationGroupPaths(root, validGroupId(target.groupId)).groupFile,
	);
}

interface ArchiveEligibilityPaths {
	readonly confirmations: string;
	readonly group: ConfirmationGroupPaths;
}

async function archiveEligibilityPaths(
	target: ConfirmationArchiveTarget,
): Promise<ArchiveEligibilityPaths> {
	const root = await realpath(target.runsDirectory);
	const groupId = validGroupId(target.groupId);

	return {
		confirmations: join(root, "confirmations"),
		group: confirmationGroupPaths(root, groupId),
	};
}

async function requireGroupDirectories(
	paths: ArchiveEligibilityPaths,
): Promise<void> {
	await directory(paths.confirmations);
	await directory(paths.group.directory);
}

async function missingSummary(
	target: ConfirmationArchiveTarget,
): Promise<void> {
	const paths = await archiveEligibilityPaths(target);
	if (
		!(await exists(paths.confirmations)) ||
		!(await exists(paths.group.directory))
	) {
		throw new ConfirmationArchiveRefusalError(
			NOT_FOUND,
			"Confirmation group does not exist",
		);
	}

	await requireGroupDirectories(paths);
	if (await exists(paths.group.groupFile)) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation group has a saved summary",
		);
	}

	if (
		(await exists(paths.group.operatorStopFile)) &&
		!(await regularFile(paths.group.operatorStopFile))
	) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation operator stop must be a regular file",
		);
	}

	if (await stoppedBeforeGroupRecord(paths.group)) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation group has an operator stop record",
		);
	}
}

export { hasConfirmationSummary, missingSummary };
