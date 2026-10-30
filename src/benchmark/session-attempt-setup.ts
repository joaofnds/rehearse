import type { SessionCase } from "./case";
import { inheritedConfiguration } from "./claude-launch-environment";
import type { Immutable } from "./contracts";
import type { JsonObject } from "./json-value";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import { ISOLATED_SETUP, prepareActualSetup } from "./session-setup";
import type { PreparedSetup } from "./session-setup";

/** The settings keys the case and the arm's output style declare. */
function declaredSettings(
	sessionCase: SessionCase,
	styleName: string | undefined,
): Immutable<JsonObject> | undefined {
	if (styleName === undefined) {
		return sessionCase.settings;
	}

	return { ...sessionCase.settings, outputStyle: styleName };
}

interface SetupDeclaration {
	readonly sessionCase: SessionCase;
	readonly styleName: string | undefined;
	readonly setupDirectory: string;
}

async function declaredSetup(
	request: SessionAttemptRequest,
	{ sessionCase, styleName, setupDirectory }: SetupDeclaration,
): Promise<PreparedSetup> {
	if (sessionCase.isolated) {
		return ISOLATED_SETUP;
	}

	return await prepareActualSetup({
		declared: declaredSettings(sessionCase, styleName) ?? {},
		directory: setupDirectory,
		home: request.home,
	});
}

async function preparedSetup(
	request: SessionAttemptRequest,
	declaration: SetupDeclaration,
): Promise<PreparedSetup> {
	const { files, record } = await declaredSetup(request, declaration);

	return {
		files,
		record: {
			...record,
			inheritedConfiguration: inheritedConfiguration(request.environment),
		},
	};
}

export { preparedSetup as default, declaredSettings };
