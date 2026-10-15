# Run workspace prototype

An isolated UI proposal for exploring Rehearse's navigation. All records, charts,
transcripts, prices, and actions are synthetic. No product API, provider, or local
corpus is connected. Changes last until reload. The production client is untouched.

From the repository root:

```sh
python3 -m http.server 4490 --bind 127.0.0.1 --directory prototypes/run-workspace
```

Open <http://localhost:4490>. The prototype is one self-contained HTML file; edit
`index.html` and reload. It can also be opened directly from disk. No build or
dependency installation is needed.

Try these paths:

1. Open the running **audit-log / r42**. It opens Activity. Select Shape, switch to
   Report, open a citation, then switch to Context & cost. The run and step stay put.
2. Return to Runs. Open **r37**: both steps have B, but the independent final
   outcome is FAIL. **r36** has no final verdict because judging failed. Also try
   stopped **r40**, a session, a replay, and a group; open a group's attempt.
3. Open a finished step, choose Replay step, inspect the frozen checkpoint and
   spending ceiling, then start the simulated replay.
4. In Corpus, edit the instruction, review the diff, apply the simulated version,
   and replay. Use Comparisons to inspect quality beside cost and the control.
5. In Cases, open audit-log and its Workflow tab. Task definitions live here.
   In Settings, open Judges to find calibration.
6. Use Pause after step, Advance demo, Finish demo, and Stop on the live run.
   New run creates another synthetic item. Reset demo restores the initial state.

The navigation is a draft proposal. A run has one workspace with Overview,
Activity, Context & cost, and Report. Running items open Activity; ended items open
Overview. The same run and selected step stay in place across those views. Activity
remains available after completion. A step strip carries grades, output summaries,
cost, and elapsed time, with citations opening in a dialog beside the current view.

The global navigation has five destinations: Runs, Comparisons, Cases, Corpus, and
Settings. Task definitions move into Cases → Workflow. Judge calibration moves into
Settings → Judges and remains reachable from each report. Group attempts stay
nested under their group. Final workflow PASS/FAIL remains independent of step
letters, and unavailable evidence remains distinct from failed work.

Keeping the old global live/detail destinations and adding cross-links would leave
the user choosing a representation before choosing a run. A permanent list beside
the workspace would take space from transcripts and context evidence. The proposal
uses a full workspace and a single return path to Runs.

The prototype retains the navy and lavender identity, with cyan for live activity,
platform sans for UI text, and monospace for evidence and measurements. It uses
native controls and dialogs, visible keyboard focus, and 44px interaction targets.
At narrow widths, the navigation, request chart, and comparison table scroll within
their own containers.

The production client, archived design handoff, and feature inventory are unchanged.
Retaining the graph after a run ends and showing a pipeline request timeline require
production integration. Production migration is a later decision after iteration.

The corpus editor, judge review, launch, replay, and run controls change page memory
only. Workflow editing and importing are previews. Export downloads synthetic JSON
that is not a production task bundle. Comparison readings illustrate the design;
they are not experiment results or evidence that an instruction improved.
