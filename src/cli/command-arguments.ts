import type { CommandDefinition, CommandLine } from "#cli/command-contract";
import { UsageError } from "#cli/command-usage";

const SINGLE_ARGUMENT_TOKEN_COUNT = 1;
const FLAG_WITH_VALUE_TOKEN_COUNT = 2;

const OPTION_VALUE_OFFSET = 1;

const HELP_FLAG = "--help";
const JSON_FLAG = "--json";
interface ArgumentRequest {
	readonly command: CommandDefinition;
	readonly args: readonly string[];
}
class CommandArguments {
	private argument: string | undefined = undefined;
	private json = false;
	private readonly flags: string[] = [];
	public constructor(private readonly request: ArgumentRequest) {}
	public parse(): CommandLine {
		for (let index = 0; index < this.request.args.length;) {
			const token = this.request.args[index];
			if (token === undefined) {
				break;
			}

			index = token.startsWith("-")
				? this.appendFlag(token, index)
				: this.appendArgument(token, index);
		}

		return {
			argument: this.argument,
			flags: this.flags,
			helpRequested: false,
			json: this.json,
		};
	}
	private declares(name: string): boolean {
		return this.request.command.flags.some((flag) => flag.name === name);
	}
	private appendArgument(token: string, index: number): number {
		if (
			this.request.command.argument === undefined ||
			this.argument !== undefined
		) {
			throw new UsageError(
				`Unexpected argument ${token} for rehearse ${this.request.command.name}`,
			);
		}

		this.argument = token;

		return index + SINGLE_ARGUMENT_TOKEN_COUNT;
	}
	private appendFlag(token: string, index: number): number {
		if (!this.declares(token)) {
			throw new UsageError(
				`Unknown flag ${token} for rehearse ${this.request.command.name}`,
			);
		}

		if (token === JSON_FLAG) {
			this.json = true;
			return index + SINGLE_ARGUMENT_TOKEN_COUNT;
		}

		this.flags.push(token);

		return this.request.command.flags.some(
			(flag) => flag.name === token && flag.kind === "value",
		)
			? this.appendValue(token, index)
			: index + SINGLE_ARGUMENT_TOKEN_COUNT;
	}
	private appendValue(token: string, index: number): number {
		const value = this.request.args[index + OPTION_VALUE_OFFSET];
		if (value === undefined || this.declares(value)) {
			throw new UsageError(
				`Flag ${token} needs a value for rehearse ${this.request.command.name}`,
			);
		}

		this.flags.push(value);

		return index + FLAG_WITH_VALUE_TOKEN_COUNT;
	}
}
function parseCommandLine(
	command: CommandDefinition,
	args: readonly string[],
): CommandLine {
	if (args.includes(HELP_FLAG)) {
		return {
			argument: undefined,
			flags: [...args],
			helpRequested: true,
			json: false,
		};
	}

	return new CommandArguments({ args, command }).parse();
}
export { parseCommandLine as default };
