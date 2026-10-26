# Plan My Event — Product Requirements Document

Oct 2, 2026 · @Parv Jain

## Overview

Plan My Event is a web app where a team of people plans and runs one event together: its sub-events, tasks, budget, guests, invitations and attendance, all in one place.

**The problem.** Most events in India are run through WhatsApp groups, spreadsheets, phone calls and notebooks. Information is scattered, nobody knows the current headcount or budget, and tasks fall through the cracks between family members or volunteers.

**The product.** One shared event space with live updates, where:

- Organizers split work across a team with clear roles and permissions.
- Each sub-event (a mehendi, a conference session, an exhibition day) has its own guests, venue, tasks and costs.
- Guests get invitations and respond through a link, with no account needed.
- In V2, people update the app by typing or speaking plain sentences, or by messaging a WhatsApp bot, instead of filling forms.

**Positioning.** A generic event platform, built for events run by a team of non-professionals with several sub-events: weddings and family celebrations, college fests, community festivals, small conferences and exhibitions. Templates make each event type feel purpose-built.

**Project context.** A portfolio project built with the intent to launch as a real freemium product. No fixed timeline.

## Goals, non-goals and success metrics

The MVP succeeds when a real team plans one wedding and one small conference end to end in the app, without falling back to spreadsheets.

**Goals**

1. One shared, live source of truth for an event's plan, people and money.
2. Work divided across a team with fine-grained, flexible permissions.
3. Guest invitations and responses that need no guest accounts.
4. One architecture that serves invite-only and open events alike.
5. A codebase that makes V2 AI and WhatsApp features straightforward to add.

**Non-goals (for now)**

- Recurring events such as weekly meetups.
- Events above about 5,000 attendees.
- Native mobile apps (a PWA comes first).
- Multiple currencies or time zones per event.
- Vendor logins or a vendor marketplace.
- Building our own live streaming.
- Offline QR check-in.

**Success metrics (once launched)**

| Metric | What it shows |
| --- | --- |
| Events with 3 or more active members | The team collaboration model works |
| Share of tasks completed before event day | Planning actually happens in the app |
| RSVP or registration response rate | Guest flows are low-friction |
| Weekly active organizers per event in the final 4 weeks | People rely on it when pressure peaks |
| Free to paid conversion per workspace | The freemium model holds |

## Target users and personas

Five kinds of people touch an event; only the first three need accounts.

| Persona | Example | Needs | Account? |
| --- | --- | --- | --- |
| Owner | Bride's father planning a 5-function wedding | Full control, overall budget, headcount at a glance | Yes |
| Organizer / admin | College fest convenor, agency planner | Assign work, manage team and roles, track progress | Yes |
| Helper | Cousin handling decorations, registration-desk volunteer | See only their tasks or area, update status quickly from a phone | Yes |
| Guest / attendee | Wedding guest, conference registrant | Get the invite, respond, see schedule and venue | No, magic link |
| Public visitor | Someone who finds the fest's page | Read event details, register | No |

**Design implications**

- Many users are not technical (older relatives, volunteers). Screens must be simple and phone-first.
- Most sessions happen on phones, often with patchy internet.
- WhatsApp is the main channel people already use, so sharing into WhatsApp must be one tap.

## Core concepts and glossary

Everything in the app is built from a few generic concepts, so the same code serves a wedding and a conference.

| Concept | Meaning | Examples |
| --- | --- | --- |
| Workspace | Owner of events and of the paid plan. Every user gets a hidden personal workspace at sign-up; team workspaces come later. | "Rahul's workspace", later "DevFest Bhopal team" |
| Event | The container for everything. Has a type, dates, one time zone, enabled modules and status. | Sharma Wedding, DevFest 2027 |
| Event template | A preset for an event type: which modules are on, starter tasks, budget categories, UI labels. | Wedding, Conference, Fair/Exhibition, Celebration, Custom |
| Module | A feature area that can be switched on or off per event. | Guests & invitations, Registration, Agenda, Gallery |
| Sub-event | One level below the event. Has its own time, venue, capacity and visibility; with separate guests per sub-event, also its own guest list and response mode. Optional group label. | Mehendi; Keynote (track: Main); Day 2 (zone: Hall B) |
| Member | A user on the event team, holding one or more roles. | Owner, Admin, "Catering Coordinator" |
| Contact | A person the event knows about, with tags. | Guest, speaker, vendor contact |
| Household | Optional group of contacts invited together, with an expected count. | "Sharma family, 4" |
| Invitation | An invite sent to a household or contact for the whole event (default) or for chosen sub-events, with distribution status. | Card delivered in person by Uncle Ramesh |
| Attendance | One record per person or household for the whole event, or per sub-event when guests are separate; covers all response modes. | Invited, confirmed, registered, checked in |
| Response mode | How attendance is known: set once for the event, or per sub-event when guests are separate. | See below |

**Guest scope (event setting).** By default, guests belong to the whole event: everyone invited is expected at every sub-event, with one invitation, one response and one headcount. An owner or admin can switch the event to separate guests per sub-event, giving each sub-event its own guest list, response mode and headcount (e.g. fewer guests at the Mehendi). Switching to separate copies every existing guest onto all sub-events; switching back merges them into one event-wide list.

**Response modes**

| Mode | How attendance is known | Typical use | Phase |
| --- | --- | --- | --- |
| Invite only | No responses. Headcount = sum of expected counts on invitations. | Indian wedding functions | MVP |
| Invite + RSVP | Invited households reply once with how many are coming. | Private dinner, corporate party | MVP |
| Open registration | Anyone registers on the public page; registering is the RSVP. | Free workshop, college fest | MVP |
| Tickets | Buying a ticket is the RSVP. | Paid conference, exhibition | Later |

RSVP is answered once per household with a number; nobody fills in names for others.

## Roles and permissions

Access is permission-based: a role is a named bundle of permissions, a member can hold several roles, and each role assignment can be scoped to the whole event or to specific sub-events.

**Permission catalog (initial)**

| Area | Permissions |
| --- | --- |
| Event | event.view, event.settings, event.delete |
| Members | members.view, members.manage |
| Roles | roles.manage |
| Sub-events | subevents.view, subevents.edit |
| Tasks | tasks.view, tasks.edit, tasks.assign, tasks.update\_own |
| Budget | budget.view, budget.edit |
| Guests | guests.view, guests.edit, guests.invite |
| Registration and check-in | registrations.view, registrations.manage, checkin.perform |
| Website and gallery | website.edit, gallery.upload, gallery.manage |
| Activity | activity.view |

**Standard roles** (created with every event)

| Role | Summary |
| --- | --- |
| Owner | Everything, including deleting the event and transferring ownership |
| Admin | Everything except deleting the event and transferring ownership |
| Editor | Edit plan content: sub-events, tasks, budget, guests |
| Helper | View the plan, update tasks assigned to them (tasks.update\_own) |
| Viewer | Read only |

**Rules**

1. Admins can create custom roles and edit any role, including standard ones, except Owner.
2. The Owner role cannot be edited, deleted or assigned by anyone but the owner. Only the owner transfers ownership.
3. Nobody can create or assign a role with permissions beyond their own.
4. Effective permissions = the union of all a member's role assignments that apply to the sub-event in question.
5. Every action, including future AI and WhatsApp actions, is checked against the acting member's effective permissions.
6. Custom roles exist per event (workspace-level roles come later).

**Later:** permissions limited to a category, e.g. edit only catering expenses (V2).

## MVP feature requirements

The MVP delivers the full planning loop for both invite-only and open events: team, sub-events, tasks, money, guests, responses and a live dashboard.

### 1. Accounts and access

- Sign in with Google or email OTP. Phone OTP deferred until demand rises.
- User profile: name, photo, phone (phone used later for WhatsApp linking).
- Hidden personal workspace created at sign-up; all events belong to it.
- Invite members to an event by email or shareable invite link; invitee picks up the assigned role on joining.
- Permission-based roles, standard presets, custom roles, multiple roles per member, sub-event scoping (see Roles and permissions).

### 2. Event setup

- Create an event from a template: Wedding, Conference, Fair/Exhibition, Celebration, Custom.
- Details: name, type, start and end dates, one time zone, venues (several allowed), cover image, description.
- Module toggles; the template sets defaults. Guest scope: whole event (default) or separate guests per sub-event.
- Status: draft, planning, live, completed, archived.

### 3. Sub-events

- Create, edit, delete sub-events with name, start and end time, venue, capacity, notes.
- Optional group label (track, zone, category) for display grouping.
- Visibility: public, private, invite-only.
- Response mode (invite only, invite + RSVP, open registration): set once for the event, or per sub-event when guests are separate.
- Timeline view grouped by date or label.

### 4. Event dashboard

- Countdown to the event and to the next sub-event.
- Task progress overall and per sub-event; overdue tasks.
- Budget vs. actual, pending payments.
- Headcount per sub-event: expected, confirmed, registered.
- Invitation distribution progress (e.g. 212 of 340 delivered).
- Updates live for everyone viewing.

### 5. Task planner

- Tasks with title, description, assignee(s), due date, priority, status, category, linked sub-event.
- Subtasks or checklist items.
- List and kanban views, filters by assignee, sub-event, status.
- Starter task lists from the event template.
- "My tasks" view for helpers.

### 6. Budget and expenses

- Overall budget and per-category budgets.
- Expenses: amount (INR), category, sub-event, vendor name, paid by (member), payment status (planned, advance paid, partially paid, fully paid), due date.
- Budget vs. actual summary by category and sub-event.

### 7. Contacts and households

- Event contact list with name, phone, email, tags (e.g. VIP, bride side, speaker).
- Optional households with an expected count.
- CSV import with column mapping.

### 8. Invitations and responses

- Invite a household or contact to the event; with separate guests per sub-event, choose which sub-events.
- Distribution tracking: not sent, sent digitally, delivered in person; assigned distributor (a member).
- Unique magic link per invitation; no guest account.
- RSVP page (for invite + RSVP sub-events): yes/no and number coming, once per household.
- Standard fields only (name, phone, email, attending); answers stored in a flexible format for the V2 form builder.
- Share invitation via link, email, or a prepared WhatsApp message the organizer forwards.

### 9. Open registration

- Public registration page per event listing open sub-events.
- Standard fields; confirmation by email.
- Registrations appear as attendance records alongside invited guests.

### 10. Activity log and notifications

- Activity log of every change: who, what, when, through which channel (app, later AI or WhatsApp).
- Undo for recent changes where safe.
- In-app notifications: task assigned, task due, mention, role changed.

### 11. Photo gallery (placeholder)

- Organizer uploads, albums per sub-event, simple grid view.
- Built as a separate media module so upload permissions and guest uploads can be added later.

## V2 feature requirements

V2 makes the app faster to use (AI and WhatsApp updates) and fills in what open events and public pages need.

### AI assistant

All AI features share one engine: the model reads the event's current data and proposes changes using the same actions the app already has. Rules for every AI feature:

- **Always preview before saving.** The user sees the proposed changes and confirms or edits.
- **Acts as the user.** Limited to that member's effective permissions.
- **Logged and undoable.** Activity log shows e.g. "Rahul (via quick update)".
- **Asks when unsure** (two caterers, unknown payee) instead of guessing.
- **Understands English, Hindi and Hinglish.**

| Feature | What it does | Plan |
| --- | --- | --- |
| Quick update | Plain sentence such as "finalized the caterer, paid 20k advance" becomes task, vendor and expense changes | Free with limits |
| Voice input | Speak the update instead of typing | Free with limits |
| Ask about the event | "How many confirmed for the sangeet?", "What's overdue this week?" | Free with limits |
| Generate a plan | Describe the event; get starter tasks, timeline and budget categories | Free with limits |
| Paste a guest list | Messy pasted list becomes clean contacts and households | Free with limits |
| Draft messages | Invitation text, reminders, announcements | Free with limits |
| Payment screenshot reading | Extracts amount, payee, date, transaction ID and status from a UPI or bank screenshot; matches a vendor or expense; saves the image as the receipt | Free in app |
| Bill and quotation reading | A vendor's quotation photo becomes a planned expense | Free in app |

Payment screenshot rules: flag pending or failed payments instead of recording them as paid; catch duplicates by transaction ID; label as "receipt attached", never "verified"; visible only to members with budget.view.

### WhatsApp bot (one-to-one, paid)

- Organizer links their phone number to their membership.
- They message the Plan My Event WhatsApp number with a text update, voice note or payment screenshot.
- The bot replies with a preview and Confirm / Edit buttons; on confirm, changes are applied.
- After confirming, the bot offers a short summary the user can forward to their own family or team group.
- Media received from WhatsApp is downloaded and stored immediately.

### Other V2 features

- **Tasks:** due-date reminders, comments and attachments.
- **Budget:** receipt uploads, CSV export.
- **Vendors:** vendor list with contacts and services; payments linked to expenses.
- **Contacts:** duplicate detection.
- **Invitations:** RSVP deadline and reminders to non-responders; designed digital invitation cards from templates.
- **Form builder:** custom questions on RSVP and registration forms (text, single choice, multiple choice, yes/no).
- **Registration:** capacity limits and waitlist, manual approval, confirmation email with QR code.
- **Check-in:** QR scan with a phone camera, manual search, live attendance count. Online only.
- **Communication:** email announcements to attendees.
- **Event website:** auto-generated public page with details, schedule, venue map, RSVP or register button, FAQs; custom URL slug and theme.
- **Live stream:** embed a YouTube or other stream link on the website.
- **Agenda and speakers:** sessions with tracks, speaker profiles, public agenda.
- **Roles:** permissions limited to a category.
- **Dashboard:** recent activity feed.
- **Platform:** search, installable PWA, export or delete my data.

## Later features

These wait for real users, revenue or platform approvals; the MVP data model leaves room for each.

| Feature | Why later | Groundwork in MVP |
| --- | --- | --- |
| Paid ticketing (in-platform purchase) | Payment gateway, refunds and GST add major complexity | Attendance records can link to a ticket later |
| Team workspaces for organizations | Not needed until colleges or agencies run many events | Hidden personal workspace owns every event |
| Workspace-level reusable roles | Depends on team workspaces | Roles already permission-based |
| WhatsApp group bot for core teams | Needs an Official Business Account; groups capped at 8 members | Same action layer as the one-to-one bot |
| Automated WhatsApp and SMS messaging | Per-message cost; paid plans only | Message templates and usage tracking |
| Phone OTP login | SMS cost | Phone stored on profile |
| Exhibitors, booths, floor plan | Fairs and exhibitions only | Module system |
| Sponsors with tiers and logos | Website extra | Module system |
| Guest photo uploads with moderation, bulk download | Storage cost and permissions design | Separate media module |
| Calendar view of tasks | Nice to have | Tasks have due dates |
| Duplicate an event, save as own template | Needs real usage first | Templates are data |
| Cost splitting between parties | Specific to shared family events | Expenses record who paid |
| Daily digest per member | Builds on AI summaries | Activity log |
| Custom domains for event websites | Paid feature | Website slug |
| Hindi and other UI languages | After English launch | All UI text through translation keys |
| Native mobile app | After PWA proves demand | Clean API used by the web app |

## Key user flows

Six flows define the MVP and V2; each must work comfortably on a phone.

**A. Create an event (owner)**

1. Sign in with Google or email OTP.
2. Pick a template, e.g. Wedding.
3. Enter name, dates, main venue.
4. Review the suggested sub-events and modules; adjust.
5. Land on the dashboard with starter tasks and budget categories already in place.

**B. Build the team (owner or admin)**

1. Open Members, choose Invite, pick one or more roles and an optional sub-event scope.
2. Share the invite link on WhatsApp or send by email.
3. Invitee signs in and joins with those roles.
4. Optionally create a custom role, e.g. "Catering Coordinator", from a list of permissions.

**C. Invite-only wedding function**

1. Import contacts from CSV; group them into households with expected counts.
2. Invite households to the event. If separate guests per sub-event is switched on, choose functions (e.g. all to Wedding, fewer to Mehendi).
3. Assign card distribution to members by area.
4. Distributors mark cards as delivered from their phones.
5. Dashboard shows expected headcount per function and distribution progress.

**D. Guest responds (invite + RSVP)**

1. Guest opens the magic link from WhatsApp or email.
2. Sees the invitation, sub-events, dates and venues.
3. Selects attending or not and how many are coming, once for the event or per sub-event when guests are separate.
4. Headcounts update live on the organizers' dashboard.

**E. Open registration (college fest or conference)**

1. Organizer sets sub-events to open registration and shares the public page.
2. Visitor fills the form and gets a confirmation email.
3. Registrations appear in the attendance list; in V2 a QR code is used at check-in.

**F. Quick update (V2, app or WhatsApp)**

1. Member types, speaks or sends: "finalized the caterer, paid 20k advance" or a payment screenshot.
2. The assistant proposes changes: complete task, add vendor note, record ₹20,000 advance with receipt.
3. Member confirms or edits.
4. Changes are saved, logged with the channel, and visible to everyone instantly; undo is available.

## Data model

Every record hangs off an event, and every event off a workspace, so access checks and data isolation follow one path.

```
Workspace (owns events and billing)
└── Event (type, dates, time zone, status, modules, guest scope)
    ├── Team:       Member · Role · Role assignment (+ sub-event scopes)
    ├── Program:    Sub-event · Venue · Module setting
    ├── Planning:   Task · Budget category · Expense
    ├── Guests:     Contact · Household · Invitation · Attendance
    ├── Platform:   Activity log · Media · Usage record (per workspace)
    └── V2 / Later: Vendor · Form answers (JSON) · Ticket
```

Full schema: docs/DatabaseDesign.md.

Attendance is the hub for guests: it ties a contact or household to the whole event, or to one sub-event when guests are separate, whatever the response mode, and later to a ticket.

**Key fields**

| Entity | Key fields |
| --- | --- |
| Workspace | id, name, plan, is\_personal |
| Event | workspace\_id, type, name, start/end dates, time zone, status, guest\_scope (whole\_event or per\_sub\_event), response\_mode, settings (JSON) |
| Module setting | event\_id, module, enabled, config (JSON) |
| Sub-event | event\_id, name, start/end, venue\_id, capacity, visibility, response\_mode (per-sub-event scope only), group\_label |
| Venue | event\_id, name, address, map link |
| Member | event\_id, user\_id, joined\_at, phone (for WhatsApp linking, V2) |
| Role | event\_id, name, is\_standard, is\_owner, permissions (list) |
| Role assignment | member\_id, role\_id, scope (whole event or list of sub-event ids) |
| Task | event\_id, sub\_event\_id?, title, assignees, due date, priority, status, category, parent\_task\_id? |
| Budget category | event\_id, name, planned\_amount\_paise |
| Expense | event\_id, category\_id, sub\_event\_id?, vendor, amount\_paise, paid\_by\_member\_id, payment\_status, receipt\_media\_id?, transaction\_ref? |
| Contact | event\_id, name, phone, email, tags, household\_id? |
| Household | event\_id, name, expected\_count |
| Invitation | event\_id, household\_id or contact\_id, sub\_event\_ids (per-sub-event scope only), magic\_link\_token, delivery\_status, distributor\_member\_id |
| Attendance | event\_id, sub\_event\_id (empty for whole-event scope), household\_id or contact\_id, source (invited, registered, ticket), status, party\_size, answers (JSON), checked\_in\_at |
| Activity log | event\_id, actor, channel, action, entity, before, after, created\_at |
| Media | event\_id, kind (gallery, receipt, cover), storage key, uploaded\_by, album |
| Usage record | workspace\_id, metric (AI call, message, storage), amount, period |

## Architecture principles and non-functional requirements

The central rule: every change, from any channel, goes through one shared action layer that checks permissions and writes the activity log.

**Architecture principles**

1. **One action layer.** Web UI, public pages, AI assistant and WhatsApp bot all call the same actions (e.g. completeTask, createExpense, recordRsvp). No business logic in UI code.
2. **Permission check inside every action**, using the acting member's effective permissions.
3. **Activity log written by the action layer**, recording actor, channel (app, public link, AI, WhatsApp), before and after values.
4. **Workspace scoping on every query.** Every event belongs to a workspace; data never leaks across workspaces.
5. **Modules as switches**, not forks: a module adds tables and screens but never changes core entities.
6. **Flexible fields as JSON** for template settings and custom form answers.
7. **Money as integer paise** in INR to avoid rounding errors.
8. **Media behind one storage service** (gallery, receipts, cover images) with access tied to permissions.
9. **All UI text through translation keys** from day one.
10. **Plan limits checked centrally** (members, events, AI calls, messages per workspace).

**Non-functional requirements**

| Area | Requirement |
| --- | --- |
| Scale | Up to about 5,000 attendees and about 50 members per event without slowdown |
| Real-time | Dashboard, tasks, headcounts update for all viewers within about 2 seconds of a change |
| Devices | Phone-first responsive web; installable PWA in V2 |
| Connectivity | Online required, including QR check-in |
| Time | One time zone per event, all times stored in UTC |
| Security | Magic links are long random tokens, revocable, scoped to one invitation |
| Privacy | Guest phone numbers and payment screenshots visible only with the right permission; event data deletable by the owner; aligned with India's DPDP Act |
| Reliability | Daily backups; activity log enables undo and audit |
| Accessibility | Readable on small screens, large tap targets, simple language |
| Tech stack | Decided: see docs/SystemDesign.md |

## Monetization and plan limits

Freemium, billed per workspace: the planning core is free, and anything that costs us money per use (messages, AI, storage) is limited on free and included on paid plans.

| Capability | Free | Paid |
| --- | --- | --- |
| Events, sub-events, tasks, budget, guests | Yes, with limits on events and members | Higher or no limits |
| Invitations via link, email, WhatsApp share | Yes | Yes |
| AI features in the app | Limited monthly uses | Higher limits |
| WhatsApp bot (one-to-one) | No | Yes |
| Automated WhatsApp and SMS messages (Later) | No | Yes, included up to a quota |
| Gallery storage | Small quota | Larger quota |
| Event website custom domain (Later) | No | Yes |
| Paid ticketing (Later) | — | Fee model to decide |

Exact limits and prices are set before launch (see Open questions). The app tracks usage per workspace from the MVP so limits can be enforced without code changes.

## Open questions and risks

The feature set is locked; what remains open is pricing and a few V2 details, plus risks to watch.

**Open questions**

- [x] Tech stack: decided (see docs/SystemDesign.md).
- [ ] Free plan limits: events, members, AI uses, storage.
- [ ] Paid plan pricing and whether to charge per workspace, per event or both.
- [ ] Which AI model provider to use, and cost per update.
- [ ] WhatsApp Business Platform setup and business verification for the V2 bot.
- [x] Email provider: Resend.
- [ ] Ticketing fee model and payment gateway (Later).

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope creep across many modules | MVP never ships | Hold the phase tags; demo with two seed events |
| Non-technical users find it complex | Low adoption in families | Templates, phone-first screens, test with older relatives |
| WhatsApp platform rules change or limit bots | V2 bot delayed | Bot is one channel over the shared action layer; app keeps working |
| AI applies wrong changes | Users lose trust | Preview always, permission checks, undo |
| AI and messaging costs grow with usage | Free plan becomes expensive | Central usage tracking and plan limits |
| Fake payment screenshots | Wrong financial records | Label as receipt, not verified; duplicate detection |
| Sensitive guest and payment data | Privacy and legal exposure | Permission-gated access, deletion, DPDP Act alignment |
| Competing with dedicated wedding and ticketing apps | Hard to stand out | Lead with team-run, multi-sub-event events and the quick-update experience |
