# Connected desktop prototype and visual comparison

From the repository root:

```sh
python3 -m http.server 4493 --bind 127.0.0.1 --directory prototypes/ux-comparison
```

Open **<http://localhost:4493/after.html>** for the connected prototype. It starts
with a populated Runs list. The newer Results, Context & cost and Comparison
layouts use the original workspace prototype's demo interaction model.

The connected prototype uses synthetic data throughout. Run controls, instruction
edits, corpus versions, launches and human reviews change page memory only. Reload
or Reset demo restores the initial records. No provider, application API, real
corpus, settings file or experiment records are connected. Importing/creating task
definitions and corpus filesystem operations are explicitly unavailable in this
demo. Export definition downloads a clearly labeled synthetic JSON sketch; it is
not an importable production task bundle.

## Try complete journeys

- Search **r37** in Runs. Open it, select Shape, switch to Context & cost, choose
  requests, sources and receiving agents, then return to Results. The run and step
  stay selected; the investigation is remembered for that run and step.
- On an ended step, choose **Test an instruction**. Edit, review the diff, apply a
  demo version and replay. Advance and finish the demo, open Results, then compare
  with the source. Source input, corpus versions and the instruction diff stay
  attached to the experiment.
- Open Comparisons, inspect the supplied comparison, then an arm's group and an
  individual attempt. Breadcrumbs and related links return to the comparison.
  Extending the comparison adds inspectable demo attempts to all three groups.
- Use **Search workspace** or `/` to find a run, case, instruction or comparison.
  Case definitions and their related runs live under Cases; judge review lives in
  Settings and is reachable from Results. Escape closes a dialog.
- Launch a new demo run from a case, or advance/stop the running **r42**. Return to
  Runs to see the changed state. Search and filters are retained during navigation.
- Inspect **r37** to read a failed task beside an accepted step, then switch
  requests in Context & cost. The [information design criteria](INTERACTIONS.md#information-design)
  describe the scope, units and evidence these readings must communicate.

The [interaction contract](INTERACTIONS.md) records the flows being evaluated.
The [original workspace prototype](../run-workspace/README.md) remains available
at <http://localhost:4490>. Production UI behavior is unchanged.

## Frozen before-and-after references

Open <http://localhost:4493/> for the matched visual gallery. These captures
illustrate the earlier four first-priority proposals in the
[UX review](../../docs/ux-review.md); they are frozen references, rather than
screenshots of the connected synthetic prototype.

Select a screen and switch Before / After, Side by side, or Inspect at 1:1.
Keys `1` / `2` switch before / after; arrows change screens. **Open saved-record
example** opens `saved-example.html` with the matching evidence inspectors.
The gallery links to the connected prototype for navigation testing.

The current-product images are actual 1440×900 captures at `900e5a57`. The saved
examples use the same selected evidence:

| Pair           | Saved example                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run Results    | r44 audit-log; final FAIL; three failed criteria; independent accepted Build B; whole-run and step costs                                              |
| Replay Results | r39 Shape B; saved scorecard and citations; two exploratory readings at the same input; execution, Product Owner and Judge costs                      |
| Context & cost | g6 attempt 1; one recorded request; 3,298 input tokens; separate output; provider amount; unpriced calculation; 17 content gaps                       |
| Comparison     | triage-inbox-cut; 18 attempts; baseline/candidate/control identities; check outcomes; cost and reply-length readings; attribution and sampling limits |

`selected-records.json` belongs only to those frozen examples. It is a reviewed
display snapshot, not a raw record export. It excludes complete transcripts,
loaded private instructions and source-file bodies. Selected short quotations
from saved Judge citations are included verbatim. Neither the captures nor their
metadata are relabeled as synthetic; the connected demo does not use these real
measurements to support invented transcripts.

`after.html` is the connected prototype. Its inline script is outside the
project's typecheck and lint scope and has no automated interaction tests. After
changing it, rerun the manual journeys above in a browser, including Back/Forward
and Reset demo, and inspect the console for errors. `connected-base.css` carries the original prototype's
shared shell styles; `connected.css` carries the newer layout and type roles.
`screens.js` and `screens.css` serve the frozen examples. Changes to a frozen
example require checking its copy and snapshot, then recapturing at 1440×900.

Inter and JetBrains Mono come from the project's Fontsource packages, under the
SIL Open Font Licenses in [FONT-LICENSES.txt](FONT-LICENSES.txt).
