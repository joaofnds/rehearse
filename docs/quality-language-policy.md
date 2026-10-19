# Language and runtime policies

Rehearse's quality checks enforce TypeScript on Bun. The root configuration,
required-rule inventory, and required option profiles define one policy across
maintained source. Each enforced rule has error severity; source suppressions,
per-file overrides, and maintained-source exclusions are forbidden.

Some native restrictions prescribe opposing language or runtime choices. The
selection below preserves the checks that support Rehearse's execution model and
existing interfaces.

| Native restriction              | Enforced policy or required contract                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oxc/no-async-await`            | `typescript/promise-function-async` requires `async` for promise-returning functions. The native require-await rules require those functions to await asynchronous work.                                            |
| `oxc/no-optional-chaining`      | `typescript/prefer-optional-chain` requires optional chaining for supported nullish access patterns.                                                                                                                |
| `oxc/no-rest-spread-properties` | `prefer-object-spread` requires object spread when copying properties instead of `Object.assign`.                                                                                                                   |
| `no-ternary`                    | `unicorn/prefer-ternary` requires conditional expressions for supported conditional assignments.                                                                                                                    |
| `no-undefined`                  | Native `no-void` rejects value-producing `void` expressions and directs callers to `undefined`. Shadowing and assignment checks protect that built-in value; `unicorn/no-useless-undefined` rejects redundant uses. |
| `unicorn/no-null`               | Record and HTTP schemas distinguish JSON `null` from a missing member. Replacing it with `undefined` changes serialization and validation.                                                                          |
| `import/no-named-export`        | Modules expose multiple domain operations and named RPC and type contracts. `import/prefer-default-export` requires a default export for a module with one runtime export.                                          |
| `import/no-default-export`      | `import/prefer-default-export` requires a default export for a single runtime entry. Vite and oxlint's plugin loader also consume default exports.                                                                  |
| `import/no-nodejs-modules`      | Bun's Node APIs provide filesystem operations and the async local scopes used by record and corpus reads.                                                                                                           |
| `node/no-top-level-await`       | `unicorn/prefer-top-level-await` requires awaited module initialization. Callers that depend on initialized exports must observe completion.                                                                        |

The [native CLI regression tests](../tools/quality-language-contracts.test.ts)
check that each supported construct passes the root configuration and that adding
its opposing restriction rejects it. The tests also retain native rejection of
value-producing `void`, built-in shadowing, and assignment to `undefined`.

`typescript/return-await` uses `always`: a returned promise must be awaited even
when the function already awaited another operation. This enforces awaited
forwarding inside and outside error-handling blocks. The [await contracts](../tools/quality-await-contracts.test.ts)
exercise both forms under the complete root policy.

The native default-export rule and `anti-slop/prefer-default-runtime-export`
enforce the runtime entry convention together. Named type exports do not turn a
single runtime entry into a multiple-entry module. The [runtime export contracts](../tools/oxlint/anti-slop/runtime-exports.test.ts)
cover separate and inline type exports, re-exports, and overloads.

Bun exposes `undefined` as a non-writable, non-configurable global. An own property
whose value is `undefined` still exists even though JSON omits it; a property whose
value is `null` survives JSON serialization. Code keeps these meanings explicit.
`no-shadow` protects built-in globals, `no-shadow-restricted-names` protects names
such as `undefined`, and `no-global-assign` rejects writes to read-only globals.

The contracts behind the runtime choices include [nullable record
fields](../src/benchmark/contracts.ts), [record read scopes](../src/benchmark/record-read-scope.ts),
[corpus read scopes](../src/benchmark/corpus-read-scope.ts), and the client's
[typed RPC clients](../client/src/api-client.ts). Changes to those contracts require
the same compatibility checks as changes to the rule selection.
