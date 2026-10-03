# Page mode

For long-form pages: a repo home, a landing page, a brand guide, a long post. A page is judged as a read, not as one frame.

1. **Capture** the page at desktop and phone widths with `site-capture`. Note the column width at each, because that is where the figures render. A GitHub README is about 830 px on desktop and 324 px on a phone.
2. **Measure before judging.** Record:
   - length in words, and in px at each width;
   - where the first action sits (install, buy, try), in px from the top;
   - what repeats (a tagline or a claim) and how many times;
   - which tables and code blocks scroll sideways;
   - whether there is a contents list on a page longer than about three screens.
3. **Lenses.**
   - INFORMATION ARCHITECTURE: does the order answer what this is, who it is for and how to start, in that order? Is there a map? Do sections for different readers interleave?
   - EDITOR: what to cut or move elsewhere (a full reference into docs/, credits into their own page).
   - Add others only where the page needs them (TYPE DIRECTOR for measure and hierarchy, COPY for the opening lines).
4. **Figures.** Run `cstack svg legibility <figures> --width <desktop>,<phone>` and add `--page` with the dark page colour when the host has a dark mode. Text under the minimum at the phone width is either made larger or treated as texture nobody needs to read.
5. **The fix** is a proposed order plus a cut list, biggest problem first, each item tied to a measurement from step 2.
