import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TestResources } from "#benchmark/test-support";

interface LiveCorpusFixture {
	readonly backingRoot: string;
	readonly root: string;
}
interface SessionAttemptResourceTracker {
	readonly track: (directory: string) => void;
}
class SessionAttemptTestFiles {
	private constructor(
		private readonly resources: SessionAttemptResourceTracker,
	) {}
	public static forEachTest(): SessionAttemptTestFiles {
		return new SessionAttemptTestFiles(TestResources.forEachTest());
	}
	public async temporary(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		this.resources.track(directory);
		return directory;
	}
	public async unreadableHistory(): Promise<string> {
		const fixture = await this.temporary("rehearse-fixture-");
		await mkdir(join(fixture, "dot-git"), { recursive: true });
		await writeFile(join(fixture, "dot-git", "HEAD"), "ref: refs/heads/main\n");
		return fixture;
	}
	public async outOfExtentCorpus(): Promise<LiveCorpusFixture> {
		const root = await this.temporary("rehearse-live-install-");
		const backingRoot = await this.temporary("rehearse-live-backing-");
		const outside = await this.temporary("rehearse-live-outside-");
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await mkdir(join(root, "output-styles"), { recursive: true });
		await symlink(
			join(outside, "foreign.md"),
			join(root, "output-styles", "foreign.md"),
		);
		return { backingRoot, root };
	}
	public async invalidBackingCorpus(): Promise<LiveCorpusFixture> {
		const root = await this.temporary("rehearse-live-install-");
		const outside = await this.temporary("rehearse-live-outside-");
		const backingRoot = join(
			await this.temporary("rehearse-live-backing-"),
			"file",
		);
		await Bun.write(backingRoot, "not a directory\n");
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await mkdir(join(root, "output-styles"), { recursive: true });
		await symlink(
			join(outside, "foreign.md"),
			join(root, "output-styles", "foreign.md"),
		);
		return { backingRoot, root };
	}
}
export { SessionAttemptTestFiles as default };
