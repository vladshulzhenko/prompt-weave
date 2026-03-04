# prompt-forge-ts

Composable prompt DSL for AI agents.

## Install

```bash
npm install prompt-forge-ts
```

## Usage

```ts
import { Prompt, System, If, Each, Bracket } from "prompt-forge-ts";

const role = "travel assistant";
const user = { isPremium: true };
const tasks = ["Plan a 3-day trip", "Include budget options"];

const p = Prompt([
  System(`You are a ${role}.`),
  If(user.isPremium, "Please give detailed answers.", "Give short answers."),
  "Here are the tasks:",
  Each(tasks, (t) => `- ${t}`),
  Bracket("Return JSON only", "(", ")"),
]);

const promptText = p.render();
const messages = p.toMessages();

const labeled = p.render({
  includeRoleLabels: true,
  roleLabelBrackets: ["<", ">"],
  roleLabelCase: "capitalize",
  roleLabelSuffix: " ",
  wrapper: ["--- BEGIN PROMPT ---\n", "\n--- END PROMPT ---"],
});
```

### Render output example

```txt
System: You are a travel assistant.

Please give detailed answers.

Here are the tasks:
- Plan a 3-day trip
- Include budget options
(Return JSON only)
```

### Render with role labels + brackets

```txt
--- BEGIN PROMPT ---
<System> You are a travel assistant.

<User> Please give detailed answers.
Here are the tasks:
- Plan a 3-day trip
- Include budget options
(Return JSON only)
--- END PROMPT ---
```

## API

- `Prompt(parts)` -> returns `{ render(), toMessages() }`
- `System(content)` -> marks content as `system` role
- `If(condition, whenTrue, whenFalse?)` -> conditional branch in prompt tree
- `Each(items, mapper)` -> map iterable items into prompt parts
- `Bracket(content, left?, right?)` -> wraps prompt content with brackets/tokens

### `render(options)`

- `separator?: string` -> message separator (default `"\n\n"`)
- `systemPrefix?: string` -> prefix for system content in basic render mode (default `"System: "`)
- `includeRoleLabels?: boolean` -> render all messages with role labels
- `roleLabelCase?: "upper" | "lower" | "capitalize" | "none"`
- `roleLabelBrackets?: [string, string]` -> bracket pair around role labels (default `["[", "]"]`)
- `roleLabelSuffix?: string` -> text between role label and message (default `" "`)
- `wrapper?: [string, string]` -> wraps the entire rendered prompt
