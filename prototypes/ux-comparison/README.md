# Desktop before-and-after review

Matched comparisons for the four first-priority proposals in the
[UX review](../../docs/ux-review.md). The current-product images are actual
1440 × 900 captures at `900e5a57`; the proposed images use the same saved evidence
in standalone HTML. The application remains unchanged.

From the repository root:

```sh
python3 -m http.server 4493 --bind 127.0.0.1 --directory prototypes/ux-comparison
```

Open <http://localhost:4493>. Select a screen, then switch **Before** / **After**
to compare at the same scale, or choose **Side by side**. **Inspect at 1:1** opens
the selected image at its natural size. Keys `1` / `2` switch before / after;
left / right arrows change screens. Escape closes an inspector.

**Open proposed screen** opens the standalone layout with working evidence
inspectors and disclosures. Its navigation and action controls illustrate the
proposal; they do not launch work, edit a corpus, or write application records.

## Saved examples

| Pair           | Current application route                                                                                           | Evidence retained in proposal                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run Results    | `/runs/2026-10-15T12-10-20.117Z?view=results&step=build`                                                            | r44 audit-log; final FAIL; three failed criteria; independent accepted Build B; whole-run and step costs                                              |
| Replay Results | `/replays/8318df503e023369a8eb2d07048be050528106ee3a43c7765e13c3a5cdac5f4c/2026-10-14T16-17-14.161Z?view=results`   | r39 Shape B; saved scorecard and citations; two exploratory readings at the same input; execution, Product Owner and Judge costs                      |
| Context & cost | `/groups/fc72ca8b-260e-4491-a507-48e1d4e523d5/reps/fc72ca8b-260e-4491-a507-48e1d4e523d5-rep-1/attempt?view=context` | g6 attempt 1; one recorded request; 3,298 input tokens; separate output; provider amount; unpriced calculation; 17 content gaps                       |
| Comparison     | `/comparisons/251961d0a80a66646bb5efe2f7231c1b7654f5ae5b06c6b2c274dc21fa61c26e`                                     | triage-inbox-cut; 18 attempts; baseline/candidate/control identities; check outcomes; cost and reply-length readings; attribution and sampling limits |

`selected-records.json` is a reviewed display snapshot, not a raw record export.
It contains generic case findings, selected usage measurements and identities.
It excludes complete transcripts, loaded private instructions and source-file bodies.
Selected short quotations from the saved Judge citations are included verbatim.
The captures were inspected for publication. Local `.benchmark-runs` files remain
private and are unnecessary to serve the gallery.

The after layouts are frozen design examples, not production components. Some
labels and summaries are written for these particular records. Changing the
example requires checking both the copy and `selected-records.json`, then
recapturing the affected image at the same viewport. Missing evidence stays
explicit: these screens do not calculate a new grade, invent transcript text,
price an unknown model, or claim that equal checks prove equal quality.

Inter and JetBrains Mono are copied from the project's existing Fontsource
packages; their SIL Open Font Licenses are in [FONT-LICENSES.txt](FONT-LICENSES.txt).
