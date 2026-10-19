import { describe, expect, it } from "bun:test";

import { parseTranscript, skillDirectories } from "#benchmark/transcript";

import {
	assistantWith,
	metaUserWith,
	skillBlock,
	skillBody,
	userWith,
} from "./transcript-test-fixtures";

function returnsTheDirectoryEveryLoadedSkillBodyNames(): void {
	const transcript = parseTranscript(metaUserWith(skillBody));

	expect(skillDirectories(transcript)).toEqual([
		"/tmp/attempt/.claude/skills/verify",
	]);
}

function returnsNothingForASkillCallWhoseBodyNeverLoaded(): void {
	const transcript = parseTranscript(assistantWith(skillBlock));

	expect(skillDirectories(transcript)).toEqual([]);
}

function returnsNothingForAReplyThatQuotesASkillBody(): void {
	const transcript = parseTranscript(assistantWith(skillBody));

	expect(skillDirectories(transcript)).toEqual([]);
}

function returnsNothingForASkillBodyInAUserMessageTheProviderDidNotMarkAsMeta(): void {
	const transcript = parseTranscript(userWith(skillBody));

	expect(skillDirectories(transcript)).toEqual([]);
}

function returnsNothingForAMessageThatNamesASkillDirectoryAfterItsFirstCharacter(): void {
	const transcript = parseTranscript(
		metaUserWith({ text: `Quoted: ${skillBody.text}`, type: "text" }),
	);

	expect(skillDirectories(transcript)).toEqual([]);
}

describe(skillDirectories.name, () => {
	it(
		"returns the directory every loaded skill body names",
		returnsTheDirectoryEveryLoadedSkillBodyNames,
	);
	it(
		"returns nothing for a Skill call whose body never loaded",
		returnsNothingForASkillCallWhoseBodyNeverLoaded,
	);
	it(
		"returns nothing for a reply that quotes a skill body",
		returnsNothingForAReplyThatQuotesASkillBody,
	);
	it(
		"returns nothing for a skill body in a user message the provider did not mark as meta",
		returnsNothingForASkillBodyInAUserMessageTheProviderDidNotMarkAsMeta,
	);
	it(
		"returns nothing for a message that names a skill directory after its first character",
		returnsNothingForAMessageThatNamesASkillDirectoryAfterItsFirstCharacter,
	);
});
