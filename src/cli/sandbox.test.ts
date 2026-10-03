import { describe, expect, it } from "bun:test";
import { sandboxFor } from "#cli/sandbox";

const argv = ["/opt/bun", "/repo/rehearse.ts", "run", "--case", "smoke"];

function hostWith(
	...programs: readonly string[]
): (path: string) => Promise<boolean> {
	return (path) => Promise.resolve(programs.includes(path));
}

describe(sandboxFor.name, () => {
	it("confines macOS under sandbox-exec with the signal profile", async () => {
		const sandbox = sandboxFor("darwin", hostWith("/usr/bin/sandbox-exec"));

		const confined = await sandbox.confine(argv);

		expect(confined).toEqual({
			kind: "confined",
			image: {
				path: "/usr/bin/sandbox-exec",
				args: [
					"sandbox-exec",
					"-p",
					"(version 1)(allow default)(deny signal)(allow signal (target same-sandbox))",
					...argv,
				],
			},
		});
	});

	describe("when macOS lacks sandbox-exec", () => {
		it("refuses by naming the missing program", async () => {
			const sandbox = sandboxFor("darwin", hostWith());

			const confined = await sandbox.confine(argv);

			expect(confined).toEqual({
				kind: "refused",
				reason:
					"This command confines its sessions with /usr/bin/sandbox-exec, which this host lacks",
			});
		});
	});

	describe("when Rehearse has no sandbox for the operating system", () => {
		it.each(["linux", "win32", "freebsd"] as const)(
			"refuses %s by naming it",
			async (platform) => {
				const sandbox = sandboxFor(platform, hostWith("/usr/bin/sandbox-exec"));

				const confined = await sandbox.confine(argv);

				expect(confined).toEqual({
					kind: "refused",
					reason: `This command confines its sessions, and Rehearse has no sandbox for ${platform}, so it runs only on macOS`,
				});
			},
		);
	});
});
