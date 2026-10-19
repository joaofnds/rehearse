import { eslintCompatPlugin } from "@oxlint/plugins";

import {
	noChainedTypeAssertionsRule,
	noWidenThenAssertRule,
	requireSafetyCommentForTypeAssertionRule,
} from "./rules/assertion-rules.ts";
import {
	noKnownValueWideningRule,
	noUnsafeDictionaryTypeRule,
} from "./rules/dictionary-contract-rules.ts";
import {
	noModuleMockingRule,
	preferDefaultRuntimeExportRule,
} from "./rules/module-contract-rules.ts";
import noObjectParametersRule from "./rules/no-object-parameters.ts";
import noForbiddenTermInSymbolNamesRule from "./rules/no-shape-in-symbol-names.ts";
import {
	noConditionalEmptyObjectSpreadRule,
	noNumericObjectProjectionRule,
} from "./rules/object-construction-rules.ts";
import requireReturnOrAwaitForNextRule from "./rules/require-return-or-await-for-next.ts";
import {
	noReflectApplyRule,
	noReflectGetRule,
	noRuntimeTypeofRule,
} from "./rules/runtime-inspection-rules.ts";
import {
	noUnknownParametersRule,
	noUnknownReturnsRule,
	noUnknownTypeAliasesRule,
} from "./rules/unknown-contract-rules.ts";

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const antiSlopPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop" },
	rules: {
		"no-chained-type-assertions": noChainedTypeAssertionsRule,
		"no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
		"no-known-value-widening": noKnownValueWideningRule,
		"no-module-mocking": noModuleMockingRule,
		"no-numeric-object-projection": noNumericObjectProjectionRule,
		"no-object-parameters": noObjectParametersRule,
		"no-reflect-apply": noReflectApplyRule,
		"no-reflect-get": noReflectGetRule,
		"no-runtime-typeof": noRuntimeTypeofRule,
		"no-shape-in-symbol-names": noForbiddenTermInSymbolNamesRule,
		"no-unknown-parameters": noUnknownParametersRule,
		"no-unknown-returns": noUnknownReturnsRule,
		"no-unknown-type-aliases": noUnknownTypeAliasesRule,
		"no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
		"no-widen-then-assert": noWidenThenAssertRule,
		"prefer-default-runtime-export": preferDefaultRuntimeExportRule,
		"require-return-or-await-for-next": requireReturnOrAwaitForNextRule,
		"require-safety-comment-for-type-assertion":
			requireSafetyCommentForTypeAssertionRule,
	},
});

export default antiSlopPlugin;
