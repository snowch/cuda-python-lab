# Interface review

## Shared header icon controls

UX and learning-design review: compact Material 3 theme/offline actions replace header text controls; 48px targets, action labels, tooltips and focus outlines preserve discoverability and keyboard access. Existing native theme handlers, offline verification, saved work, runner controls and subject-specific links remain authoritative. The saved badge requires a verified current offline copy; an update dot identifies an offered update. Go keeps a status icon because it offers no complete offline copy. No lesson sequence, teaching claims or prerequisites change. Review phone/tablet/desktop, both themes, keyboard, storage denial and the real save/update state transitions. Functional evidence is recorded with the change; it does not establish learning effectiveness.


## Visible header labels (2026-11-26)

UX and learning-design review: retain the Material symbols and add visible
**Offline** and **Theme** labels so touch users can identify the actions without
a tooltip. The Code runner name and state, subject-specific tools, native theme
preferences and verified offline/update badges remain. Controls fit their text,
use at least 48px touch targets, and wrap on narrow screens rather than hiding
labels. No execution, lesson instructions, progress or saved-work contract changes.
The shared [course design guide](https://github.com/snowch/cuda-python-lab/blob/main/docs/course-design-guide.md#theme-and-offline-icons)
records this rule. Validation covers the built header at 320, 390, 820 and 1440px
in both themes, keyboard focus, modal opening/Escape, persistence and project-local
asset requests. Functional checks do not establish learning effectiveness.


## Shared terminal icon in the header (2026-11-27)

Use the canonical guide's bundled Material Symbols Rounded terminal icon for
Code runner, beside its label and subordinate native status. The icon is
constant across runtime states. Opening settings continues to preserve runtime
state; native handlers, status node references and saved work are unchanged.

The UX and learning-design reviews found no new prerequisite or lesson action:
the visible name identifies the control without icon knowledge, and the state
stays on the second line. Homepage introduction and course contents remain in
reading order. The 14 existing managed-runner courses passed the built UI matrix
at 320/390/820/1440px in both themes: 24px icon, 8px gap, visible label/status,
48px target, keyboard/settings/focus return, no runtime start when inspecting
settings, no page overflow and no external asset requests. xv6's original
three-column phone header failed the first pass; allowing its controls to wrap
passed the focused final rerun. Other courses without managed runners retain
their existing controls.

The interactive style mockup and reusable header browser check include this
layout. The focused CUDA Python runner and shared-style tests passed; runner
logic and examples were not changed. Functional and author reviews do not
establish learning effectiveness.
