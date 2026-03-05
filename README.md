# prompt-weave

Composable prompt DSL for AI agents.

`prompt-weave` helps you build prompts as structured parts instead of string-concatenating everything manually. You compose prompt nodes, then render them to a final string or role-based message array.

## Install

```bash
npm install prompt-weave
```

## Usage

```ts
import { Prompt, System, If, Each } from "prompt-weave";

const isPremium = true;
const tasks = ["Plan a 3-day trip", "Include budget options"];

const p = Prompt([
  System("You are a travel assistant."),
  If(isPremium, "Give detailed answers.", "Give short answers."),
  Each(tasks, (task) => `- ${task}`),
]);

const promptText = p.render();
const messages = p.toMessages();
```

### What each helper does

- `Role(role, "...")`: marks content with an explicit message role.
- `System("...")`, `User("...")`, `Assistant("...")`, `Tool("...")`: role-specific shortcuts.
- `If(condition, whenTrue, whenFalse?)`: conditionally includes content.
- `Each(items, mapper)`: transforms arrays/iterables into prompt parts.
- `Join(items, separator?)`: joins iterable content into one composed segment.
- ``Template`...${value}...` ``: tagged template helper for inline composition.
- `Bracket(content, left?, right?)`: wraps content with markers like `()`, `[]`, or custom tokens.
- `Prompt([...])`: composes all parts into one renderable prompt object.

### `render()` vs `toMessages()`

- `render()` returns a single formatted string (good for plain text prompt APIs).
- `toMessages()` returns structured role messages (good for chat-style APIs).

Example `toMessages()` shape:

```ts
[
  { role: "system", content: "You are a travel assistant." },
  {
    role: "user",
    content:
      "Please give detailed answers.\nHere are the tasks:\n- Plan a 3-day trip\n- Include budget options\n(Return JSON only)",
  },
];
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
- `Role(role, content)` -> marks content as an explicit role message
- `System(content)` -> marks content as `system` role
- `User(content)` -> marks content as `user` role
- `Assistant(content)` -> marks content as `assistant` role
- `Tool(content)` -> marks content as `tool` role
- `If(condition, whenTrue, whenFalse?)` -> conditional branch in prompt tree
- `Each(items, mapper)` -> map iterable items into prompt parts
- `Join(items, separator?)` -> join mapped parts into a single segment
- ``Template`...${value}...` `` -> inline template interpolation helper
- `Bracket(content, left?, right?)` -> wraps prompt content with brackets/tokens

### `render(options)`

- `separator?: string` -> message separator (default `"\n\n"`)
- `systemPrefix?: string` -> prefix for system content in basic render mode (default `"System: "`)
- `includeRoleLabels?: boolean` -> render all messages with role labels
- `roleLabelCase?: "upper" | "lower" | "capitalize" | "none"`
- `roleLabelBrackets?: [string, string]` -> bracket pair around role labels (default `["[", "]"]`)
- `roleLabelSuffix?: string` -> text between role label and message (default `" "`)
- `wrapper?: [string, string]` -> wraps the entire rendered prompt

## More Examples

### Role-based chat transcript

```ts
import { Assistant, Prompt, System, Tool, User } from "prompt-weave";

const prompt = Prompt([
  System("You are a booking assistant."),
  User("Find trains from Berlin to Prague tomorrow morning."),
  Tool("search_trains: 12 options"),
  Assistant("I found 3 good options under 4 hours."),
]);
```

### Inline constraints with `Join`

```ts
import { Join, Prompt } from "prompt-weave";

const constraints = ["short", "factual", "neutral tone"];
const prompt = Prompt([
  "Write the answer with these constraints:",
  Join(constraints, ", "),
]);
```

### Checklist generation with `Each` + `Join`

```ts
import { Each, Join, Prompt } from "prompt-weave";

const checklist = ["Collect requirements", "Draft response", "Validate format"];
const prompt = Prompt([
  "Follow this checklist:",
  Join(Each(checklist, (item, i) => `${i + 1}. ${item}`), "\n"),
]);
```

### Dynamic line with tagged `Template`

```ts
import { Prompt, Template } from "prompt-weave";

const locale = "en-US";
const tone = "professional";
const prompt = Prompt([Template`Respond in ${locale} with a ${tone} tone.`]);
```

### Nested helper composition

```ts
import { Bracket, Prompt, Template } from "prompt-weave";

const prompt = Prompt([
  Template`Output contract: ${Bracket("JSON only", "(", ")")}`,
]);
```

### Conditional sections for audience tiers

```ts
import { If, Prompt, System } from "prompt-weave";

const isPremium = false;
const prompt = Prompt([
  System("You are a documentation assistant."),
  If(isPremium, "Provide deep implementation details.", "Provide a concise summary."),
]);
```
