import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { git } from "#benchmark/target";
import { HTTP_STATUS_BAD_REQUEST } from "#server/http-status";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";

/**
 * A run refuses a target that is not a repository root, or is this control
 * repository, so the declaration is refused for them now rather than at the
 * first launch. Its branch and cleanliness are a run's own checks, since they
 * change between runs.
 */
async function refuseTarget(
	caseDirectory: string,
	targetPath: string,
): Promise<void> {
	const named = isAbsolute(targetPath)
		? targetPath
		: resolve(caseDirectory, targetPath);
	const resolveTargetRoot = async (): Promise<string> => {
		try {
			return await realpath(named);
		} catch {
			throw new PipelineCaseRefusalError(
				`Target ${targetPath} is not a directory on this machine`,
				HTTP_STATUS_BAD_REQUEST,
			);
		}
	};

	const root = await resolveTargetRoot();
	const resolveRepositoryRoot = async (): Promise<string> => {
		try {
			return await realpath(await git(root, "rev-parse", "--show-toplevel"));
		} catch {
			throw new PipelineCaseRefusalError(
				`Target ${targetPath} is not a git repository`,
				HTTP_STATUS_BAD_REQUEST,
			);
		}
	};

	const repositoryRoot = await resolveRepositoryRoot();
	if (repositoryRoot !== root) {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} must be its repository's root`,
			HTTP_STATUS_BAD_REQUEST,
		);
	}

	if (root === (await realpath(CONTROL_DIR))) {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} is this control repository, which a run may not change`,
			HTTP_STATUS_BAD_REQUEST,
		);
	}
}

export { refuseTarget as default };
