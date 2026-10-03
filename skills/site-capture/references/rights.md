# Capturing sites you do not own

- **robots.txt.** `cstack browse` reads it before every non-local capture and refuses a path it disallows. `--ignore-robots` is for sites the owner controls or has permission to capture, and the run record notes that it was used.
- **Terms of service.** Read them before capturing a site repeatedly. Social networks, ad libraries and marketplaces (Meta, TikTok, Instagram, X, Amazon) bar automated collection: a human browses them or uses the platform's approved API, and the owner pastes links and screenshots.
- **Pace and scope.** Capture what the task needs, not whole sites. Media downloads wait a second between files on non-local hosts.
- **What captures are for.** Screenshots, page text and media from a third-party site are internal reference for the owner's team. They are never published, redistributed, put in a deliverable, used as generation input without recorded rights, or used to train a model. Brand workspaces gitignore `work/browse/` and competitor screenshot folders so a public brand repo never carries them.
- **No bypassing.** No logins, paywalls, CAPTCHAs or bot protection are worked around; no cookies are imported and no credentials typed.
