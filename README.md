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

## Validation

You can validate prompt inputs with built-in, zod-like schemas and keep prompt construction separate from validation.

```ts
import { validate, Prompt, Each, Join, System, schema } from "prompt-weave";

const input = validate(
  {
    topic: schema.string().trim().nonempty(),
    audience: schema.enum(["free", "pro"] as const),
    maxBullets: schema.number().int().min(1).default(3),
    constraints: schema
      .array(schema.string().trim().nonempty())
      .default(() => []),
  },
  {
    topic: "refund policy",
    audience: "pro",
    constraints: ["Use bullets", "Stay concise"],
  },
);

const prompt = Prompt([
  System("You are a support assistant."),
  `Topic: ${input.topic}`,
  `Audience: ${input.audience}`,
  `Limit: ${input.maxBullets} bullets`,
  Join(
    Each(input.constraints, (constraint) => `- ${constraint}`),
    "\n",
  ),
]);

const promptText = prompt.render();
```

If you want a reusable validated prompt factory, use `definePrompt(...)`.

### `render()` vs `toMessages()`

- `render()` returns a single formatted string (good for plain text prompt APIs).
- `toMessages()` returns structured role messages (good for chat-style APIs).
- `toMessages()` has no options.
- `toMessages()` uses the library's default normalization behavior: adjacent chunks with the same role are merged, and blank content is omitted.

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

### Validation API

- `schema.string()`, `schema.number()`, `schema.boolean()` -> primitive validators
- `schema.literal(value)` and `schema.enum([...])` -> literal/enum validation with inferred types
- `schema.array(itemSchema)` and `schema.object(shape)` -> nested structured validation
- String validators: `.trim()`, `.min()`, `.max()`, `.nonempty()`, `.regex()`, `.startsWith()`, `.endsWith()`, `.email()`, `.url()`
- Number validators: `.min()`, `.max()`, `.int()`, `.positive()`, `.nonnegative()`, `.negative()`
- Array validators: `.min()`, `.max()`, `.nonempty()`
- `.optional()`, `.nullable()`, `.default(value)`, `.refine(check, message?)`, `.transform(map)` -> chainable schema helpers
- `validate(shapeOrSchema, input)` -> parse once, then build a normal `Prompt(...)`
- `safeValidate(shapeOrSchema, input)` -> ad-hoc validation without throwing
- `definePrompt(shape, build)` or `definePrompt(schema, build)` -> validates input before building a prompt
- `safeParse(value)` -> returns `{ success, data }` or `{ success, error }`
- `parse(value)` -> throws `PromptValidationError` with path-aware issues when validation fails
- `PromptValidationError` -> error class with `issues` for structured validation failures
- `Infer<typeof someSchema>` / `InferShape<typeof someShape>` -> infer TypeScript types from schemas and schema shapes

### `render(options)`

- `separator?: string` -> message separator (default `"\n\n"`)
- `systemPrefix?: string` -> prefix for system content in basic render mode (default `"System: "`)
- `includeRoleLabels?: boolean` -> render all messages with role labels
- `roleLabelCase?: "upper" | "lower" | "capitalize" | "none"`
- `roleLabelBrackets?: [string, string]` -> bracket pair around role labels (default `["[", "]"]`)
- `roleLabelSuffix?: string` -> text between role label and message (default `" "`)
- `wrapper?: [string, string]` -> wraps the entire rendered prompt

### `toMessages()`

- No options
- Returns `PromptMessage[]`
- Merges adjacent chunks with the same role into a single message
- Trims empty content and omits blank messages

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
  Join(
    Each(checklist, (item, i) => `${i + 1}. ${item}`),
    "\n",
  ),
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
  If(
    isPremium,
    "Provide deep implementation details.",
    "Provide a concise summary.",
  ),
]);
```

### Reusable validated prompt factory

```ts
import { definePrompt, Prompt, Each, Join, System, schema } from "prompt-weave";

const buildSupportPrompt = (input: {
  topic: string;
  audience: "free" | "pro";
  maxBullets: number;
  constraints: string[];
}) =>
  Prompt([
    System("You are a support assistant."),
    `Topic: ${input.topic}`,
    `Audience: ${input.audience}`,
    `Limit: ${input.maxBullets} bullets`,
    Join(
      Each(input.constraints, (constraint) => `- ${constraint}`),
      "\n",
    ),
  ]);

const supportPrompt = definePrompt(
  {
    topic: schema.string().trim().nonempty(),
    audience: schema.enum(["free", "pro"] as const),
    maxBullets: schema.number().int().min(1).default(3),
    constraints: schema
      .array(schema.string().trim().nonempty())
      .default(() => []),
  },
  buildSupportPrompt,
);

const promptText = supportPrompt.render({
  topic: "refund policy",
  audience: "pro",
  constraints: ["Use bullets", "Stay concise"],
});

const promptMessages = supportPrompt.toMessages({
  topic: "refund policy",
  audience: "free",
});
```

## Changelog

### 1.2.0

- Added built-in validation helpers with schema-based type inference.
- Added direct `validate()` and `safeValidate()` helpers for ad-hoc prompt inputs.
- Added richer validators for strings, numbers, and arrays.
- Added reusable validated prompt factories with `definePrompt()`.
- Expanded README examples and validation API documentation.
