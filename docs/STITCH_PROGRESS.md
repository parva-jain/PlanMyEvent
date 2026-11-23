# Stitch design progress

Last updated: Nov 18, 2026. Tracks which screens have Stitch designs and where to continue. Stitch project: **Plan My Event Design System** (id 3683353658768786482). Prompts were written in the planning chat; each batch below names its screens.

## Done

| Batch | Screens |
| --- | --- |
| Foundation | Design system sheet, logo (brand/), home page |
| Sign-in | Sign in, email code (incl. error), first-time welcome, sign-in from team invite, join confirmation, My events (empty) |
| Milestone 3 | Create-event wizard (template, details, review, success), Schedule (timeline, list, sub-event panel, wedding variant), Event settings (general, guest-scope switch, danger zone) |
| Core screens | Event dashboard (conference + wedding), Tasks (list, board, detail, quick add, empty, helper "My tasks"), guest invitation and RSVP page (5 states) |
| A. Team | Team, invite people (email and link), member detail, roles list, role editor, invite opened while signed in |
| B. Shell and states | My events (populated), event switcher, phone "More" menu, activity log and undo, live-update and conflict states, global states (404, no access, error, offline, session expired, plan limit, skeleton) |
| C. Budget | Budget overview (desktop, mobile, set your budget), expenses (desktop, mobile), add expense (side panel, mobile sheet), expense detail |
| D. People | People (desktop, mobile, empty), guest detail, add guests panel, send invitation, invitations by distributor, WhatsApp sending, cards to deliver, responses, CSV import (4 steps), per-function RSVP, link inactive |
| Milestone 8 (partial) | Event dashboard (DevFest desktop and mobile, Sharma Wedding), Registrations (DevFest, organizer view), Volunteer home (desktop, mobile) |

## Continue from here

| Batch | Screens | Needed for |
| --- | --- | --- |
| E | Public event page, public registration form, registration confirmation, gallery, notifications, profile and settings. Not designed; milestone 8 builds these from DESIGN.md (decided Nov 18) | Milestone 8 |
| F | Email templates (sign-in code, team invite, guest invitation, registration confirmation), privacy and terms pages, pricing page | Before launch |

## Notes for the next batches

- New prompts use the cool "Mist Deep" colors (decision 007): page #F2F3FB, cards #FFFFFF, fills #E7E9F7, borders #DCDFF0, text #12142B, secondary text #454A68; primary #4338CA; marigold #F5A524 only for small fills.
- Re-import the current docs/DESIGN.md into Stitch before Batch E.
- Add each batch's motion rows to docs/MOTION.md (section 6.16 placeholder) when it's designed.
