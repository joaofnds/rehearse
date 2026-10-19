import type { z } from "zod";

import type { sessionCaseDeclarationSchema } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";

type SessionDeclarationInput = Immutable<
	z.input<typeof sessionCaseDeclarationSchema>
>;

class SessionDeclarationBuilder {
	public constructor(
		private readonly props: Partial<SessionDeclarationInput> = {},
	) {}

	public build(): SessionDeclarationInput {
		const identity = {
			checks: [{ kind: "word-band" as const, max: 1 }],
			corpusFiles: [],
			id: "sess-case",
			kind: "session" as const,
		};
		const modeled =
			this.props.model === undefined
				? identity
				: { ...identity, model: this.props.model };
		const prompted = { ...modeled, prompt: "Reply OK." };
		const budgeted =
			this.props.sessionBudgetUsd === undefined
				? prompted
				: { ...prompted, sessionBudgetUsd: this.props.sessionBudgetUsd };

		return { ...budgeted, title: "A session case", tools: [], ...this.props };
	}
}

export { SessionDeclarationBuilder as default };
export type { SessionDeclarationInput };
