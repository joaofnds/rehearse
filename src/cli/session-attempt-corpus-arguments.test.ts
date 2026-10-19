import { expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import SessionCorpusFixture from "./session-corpus-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();
const corpora = new SessionCorpusFixture(files);

/**
 * A source string the parser cannot turn into a corpus is an unparseable
 * value, which the exit codes call a usage error; a corpus that resolves but
 * cannot be delivered is the refused precondition.
 */
it.each(["/no/such/corpus", "dotfiles:HEAD"])(
	"reports %s as a usage error, before any provider call",
	async (corpus) => {
		const failure = await failureOf(
			runSessionDebugAttempt(await corpora.requestFor(corpus)),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toContain(corpus);
	},
);
