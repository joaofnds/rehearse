# Run workspace prototype

An isolated UI proposal for exploring Rehearse's navigation. All records, charts,
transcripts, prices, and actions are synthetic. No product API, provider, or local
corpus is connected. Changes last until reload. Opening this prototype does not change production records.

From the repository root:

```sh
python3 -m http.server 4490 --bind 127.0.0.1 --directory prototypes/run-workspace
```

Open <http://localhost:4490>. The prototype is one self-contained HTML file; edit
`index.html` and reload. It can also be opened directly from disk. No build or
dependency installation is needed.

Try these paths:

1. Open the running **audit-log / r42**. It opens Activity. Select Shape, switch to
   Results, open a citation, then switch to Context & cost. The run and step stay put.
2. Return to Runs. Open **r37**: both steps have B, but the independent final
   outcome is FAIL. **r36** has no final verdict because judging failed. Also try
   stopped **r40**, a session, a replay, and a group; open a group's attempt.
3. Select a finished step and use Inputs & output or Replay step beside the workflow.
4. From **r37 / Build**, choose Test an instruction. The editor keeps the source run,
   step, file, corpus version, and frozen checkpoint visible. Edit, review, apply,
   and replay. Finish the demo and choose Compare with source. The comparison uses
   the selected step's saved source, with step costs, grades and corpus identities.
   It remains available under Comparisons. The repeated three-arm example stays
   separate and includes a control.
5. In Cases, open audit-log and its Workflow tab. Task definitions live here.
   In Settings, open Judges to find calibration.
6. Use Pause after step, Advance demo, Finish demo, and Stop on the live run.
   New run creates another synthetic item. Reset demo restores the initial state.

The navigation is a draft proposal. A run has one workspace with
Results, Activity, and Context & cost. Running items open Activity; ended items open
Results. The same run and selected step stay in place across those views. Activity
remains available after completion. A step strip carries grades, output summaries,
cost, and elapsed time, with citations opening in a dialog beside the current view.
Results holds the final outcome, step judge, artifacts, analysis and human review;
Run setup & provenance holds the case, model, corpus and frozen input. Old
overview/report links resolve to Results. Contextual links retain the selected step.

The global navigation has five destinations: Runs, Comparisons, Cases, Corpus, and
Settings. Task definitions move into Cases → Workflow. Judge calibration moves into
Settings → Judges and remains reachable from Results. Group attempts stay
nested under their group. Final workflow PASS/FAIL remains independent of step
letters, and unavailable evidence remains distinct from failed work.

Keeping the old global live/detail destinations and adding cross-links would leave
the user choosing a representation before choosing a run. A permanent list beside
the workspace would take space from transcripts and context evidence. The proposal
uses a full workspace and a single return path to Runs.

The visual starting point is the [published Claude Design artifact](https://claude.ai/artifact/3nT2thU8rddfY3Vd7C3j8w),
inspected alongside the [archived handoff](../../docs/design-handoff/README.md) and
the current application. Its compact history table, corpus card, connected workflow,
striped spend meter, quiet status colors, and adjacent session and judge panes form
the desktop foundation. Inter serves the interface; JetBrains Mono serves IDs,
evidence, and measurements. The fonts are embedded for offline use; their licenses
are in [FONT-LICENSES.txt](FONT-LICENSES.txt).

The original separates Run history, Live monitor, and Run detail in global
navigation. This proposal keeps its visual language while putting those readings
inside one run workspace. It preserves the current product's independent final
PASS/FAIL and missing-evidence states. The old artifact's task letters, paired
comparison claims, and automatic corpus-age warnings do not define current
measurement semantics.

Desktop is the design target. At 1280px and wider, the workspace keeps its header,
spend band, view tabs, and connected steps above two independently scrolling activity
and judge panes. Results and Context use one page scroll. Short browser windows scroll the Activity
workspace while preserving a readable transcript area. The bottom live strip returns to the active run from another
section. Long history, context, and result content scroll inside the main area.
Compact controls serve desktop pointers; coarse pointers retain 44px targets.
Native dialogs, visible focus, text labels for statuses, and reduced-motion support
remain in place. Narrow layouts retain a basic fallback without dedicated mobile
or tablet design work.

The [production desktop workspace](../../docs/run-workspace.md) implements this
navigation with real evidence and guarded actions. This prototype remains an
isolated place to try UI changes. The archived design handoff remains unchanged.
Production request timelines depend on the evidence each attempt recorded.

The corpus editor, judge review, launch, replay, and run controls change page memory
only. Workflow editing and importing are previews. Export downloads synthetic JSON
that is not a production task bundle. Comparison readings illustrate the design;
they are not experiment results or evidence that an instruction improved.

Instruction drafts are separate per illustrative file. A replay captures its source
readings at launch, so later navigation or edits cannot change the before arm. The
source comparison uses recorded step cost and time, names missing grades, and keeps
any source workflow verdict separate. It makes no causal or equivalence claim; no
control arm is included in this exploratory comparison. The instruction diff names
the edit made in the flow rather than claiming a complete corpus diff. Use Clear
source to leave the current experiment. Editing directly in Corpus requires choosing
a source step in Runs before replay; it does not choose a run for you.
