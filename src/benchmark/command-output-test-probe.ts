import { join } from "node:path";

import type { TestResources } from "./test-support";

const PAIR_ITEM_COUNT = 2;
class CommandOutputProbe {
	public readonly lines: string[] = [];
	public readonly twoLines = Promise.withResolvers<undefined>();
	private constructor(public readonly gate: string) {}
	public static async create(
		resources: Readonly<Pick<TestResources, "createTemporaryDirectory">>,
	): Promise<CommandOutputProbe> {
		const directory =
			await resources.createTemporaryDirectory("rehearse-command-");
		return new CommandOutputProbe(join(directory, "gate"));
	}
	public readonly read = (line: string): void => {
		this.lines.push(line);
		if (this.lines.length === PAIR_ITEM_COUNT) {
			this.twoLines.resolve();
		}
	};
}
export { CommandOutputProbe as default };
