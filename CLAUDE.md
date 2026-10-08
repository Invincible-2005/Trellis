@AGENTS.md

## How to talk with the user and ask questions

The user doesn't track the ticket details. Talk about the **application**, not the paperwork.

- **No ticket numbers or decision IDs in conversation.** Don't write "ticket 13", "D13", "per D10". Those references belong only in `.scratch/` files and commit messages. Say what the thing *does* instead: "the org-setup endpoint", "the rule about who can see a team's documents".
- **Explain with a concrete scenario from the app.** Who the user is, what they click, what they see, what the system does. Example: "Riya is HR and isn't on Team Alpha. She opens Team Alpha's task list. Should she see it?"
- **Give the options as what happens to users**, not as implementation details. Mention the technical side in one short line only if it matters for the choice.
- **One question at a time**, with **one recommendation** and the reasons in plain words.
- **Explain any technical term you can't avoid** in a short phrase the first time it appears.
- **Keep doc bookkeeping out of the chat.** Update the tickets, map and decision log quietly, and mention them in one line at most ("recorded in the project docs").
