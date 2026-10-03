import type { Sandbox } from "#cli/confinement";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/**
 * Denies every signal except to a process inside the same sandbox, so a
 * session can stop what its run started, in any turn, and nothing else.
 */
const CONFINEMENT_PROFILE =
	"(version 1)(allow default)(deny signal)(allow signal (target same-sandbox))";

function macosSandbox(pathExists: (path: string) => Promise<boolean>): Sandbox {
	return {
		confine: async (argv) => {
			if (!(await pathExists(SANDBOX_EXEC))) {
				return {
					kind: "refused",
					reason: `This command confines its sessions with ${SANDBOX_EXEC}, which this host lacks`,
				};
			}

			return {
				kind: "confined",
				image: {
					path: SANDBOX_EXEC,
					args: ["sandbox-exec", "-p", CONFINEMENT_PROFILE, ...argv],
				},
			};
		},
	};
}

function missingSandbox(platform: NodeJS.Platform): Sandbox {
	return {
		confine: () =>
			Promise.resolve({
				kind: "refused",
				reason: `This command confines its sessions, and Rehearse has no sandbox for ${platform}, so it runs only on macOS`,
			}),
	};
}

export function sandboxFor(
	platform: NodeJS.Platform,
	pathExists: (path: string) => Promise<boolean>,
): Sandbox {
	if (platform === "darwin") {
		return macosSandbox(pathExists);
	}

	return missingSandbox(platform);
}
