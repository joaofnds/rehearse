import type { SessionCase } from "./case";
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

async function preparedSetup(
	request: SessionAttemptRequest,
	{ sessionCase, styleName, setupDirectory }: SetupDeclaration,
): Promise<PreparedSetup> {
	if (sessionCase.isolated) {
		return ISOLATED_SETUP;
	}

	return await prepareActualSetup({
		declared: declaredSettings(sessionCase, styleName) ?? {},
		directory: setupDirectory,
		env: request.environment,
		home: request.home,
	});
}

export { preparedSetup as default, declaredSettings };
