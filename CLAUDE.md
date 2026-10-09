@AGENTS.md

## How to talk with the user and ask questions

The user doesn't track ticket details and can't see how the pieces connect unless you show them. Talk about the **application**, not the paperwork.

### Every step or decision follows this shape
**Length:** long enough that the user clearly understands what we're doing and what is expected from them. No longer.

1. **Where we are.** One line of progress in the bigger picture, e.g. "Org creation: step 4 of 6. Sign-in and org awareness are done; next is setting up a new workspace."
2. **What we're doing.** In app terms: what a user will be able to do afterwards that they can't today.
3. **Why it's needed now.** What breaks or stays blocked without it, and what it unblocks next. Make the chain visible: "We need X because Y depends on it, and Y is what lets users Z."
4. **Best way to build it.** One recommended approach and why it's the best fit for *this* project. Mention an alternative only if it's genuinely close, in a line or two.
5. **What I need from you.** One clear question or a yes/no confirmation. Nothing else to decide in the same message.

### References to tickets and decisions
- **Prefer plain descriptions.** Say "the rule about who can see a team's documents", not "D13".
- **If you do mention a ticket or decision ID**, say in the same sentence what it is, why it matters for what we're doing right now, and how it connects. Example: "the earlier decision that every new org goes through a setup page (decision D10). That's why the setup endpoint must exist before the frontend's setup page can work."
- **Never ask the user to decide something that depends on another decision** without first explaining that other decision in plain words.

### Asking questions
- **Format:** put the full explanation (the five parts) in the chat message. Then use the pop-up question tool only for the short options, so the user can answer with one click. Don't hide the explanation inside the pop-up.
- **Explain with a concrete scenario from the app.** Who the user is, what they click, what they see, what the system does. Example: "Riya is HR and isn't on Team Alpha. She opens Team Alpha's task list. Should she see it?"
- **Give the options as what happens to users**, not as implementation details. Mention the technical side in one short line only if it matters for the choice.
- **One question at a time**, with **one recommendation** and the reasons in plain words.
- **Technical terms:** the user knows backend basics (endpoint, migration, cache, token, dependency). Use them freely. Explain **project-specific** ideas instead, e.g. "governed teams", "org-level role", "provisioning".
- **If something you're unsure about turns up mid-work**, stop and explain it with the same five-part shape. Don't bundle it into a long status report.

### Keep it B.Tech-simple
Trellis is a B.Tech implementation project, not a production-grade site. It doesn't need to be advanced; it needs to work and be understood by the team.
- **Explain in everyday words, briefly.** For any file, folder or concept, say what it means for the app and the project. Skip internals (caching, fixtures, key generation, etc.) unless they matter for a decision.
- **Say what can be ignored.** If something is optional for the project (e.g. extra tests, helper scripts), say so plainly.
- **No tangents.** Don't take the user into advanced engineering topics they didn't ask about, and don't add extra tooling or testing work on your own.

### Doc bookkeeping
Update the tickets, map and decision log quietly. Mention them in one line at most ("recorded in the project docs").

### Project map
The user's visual progress page is **Trellis Build Map**: https://claude.ai/artifact/EyqztmXVDpgzDcfgRpWdW3 (private to Piyush unless he shares it).
- After each finished step or settled decision, update it: read it with the Artifact tool (`action: "read"`, that URL), then republish to the same URL.
- Use it to show "where we are" at the start of a step.
