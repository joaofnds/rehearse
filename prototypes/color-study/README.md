# Color and readability study

The visual direction approved for Rehearse on 2026-10-17, preserved as a synthetic
reference. The examples send no product API or provider requests. Production uses
these palette and typography roles; the other prototypes retain their own styles.
The [client design system](../../client/src/system/README.md) owns current usage.

From the repository root:

```sh
python3 -m http.server 4494 --bind 127.0.0.1 --directory prototypes
```

Open <http://localhost:4494/color-study/>. The single HTML file also opens directly from disk.
It loads Inter and JetBrains Mono from the existing prototype font assets, with
system fonts as fallbacks. Their SIL Open Font Licenses are in
[FONT-LICENSES.txt](../ux-comparison/FONT-LICENSES.txt).

Compare **Current tokens** and **Proposed**, then select Runs, Results,
Context & cost, Comparison, or Palette & controls. Both modes use the study's
layout; **Current tokens** shows the historical palette, small type and outline
actions captured before approval, rather than reproducing a production screenshot. Palette swatches
always document the proposed values.

Runs filters the sample rows. Links move between appearance samples. Action
buttons lead to the control specimens, where clicking reports the role being
shown. They never launch or stop an experiment. Grayscale applies to the screen
sample so labels, symbols and selection shapes can be compared without hue.

The proposal reserves violet for primary actions and selection, blue for links
and live information, teal for successful assessments, amber for attention and
rose for failure or destructive actions. Execution ending and comparison arm
identity stay neutral. Text uses 14px for reading and controls, 12px for metadata
and 24px for headings. Saved prose uses 1.65 line height.

Check the five screens at 1440px and 320px, with both themes and grayscale. Tables
scroll within named, keyboard-focusable regions. Tab through the controls and
check selected versus focused states. The study has no animation and makes no
claim that production accessibility has been verified.
