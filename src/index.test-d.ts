import {
  Assistant,
  Bracket,
  definePrompt,
  Each,
  type InferShape,
  If,
  Join,
  Prompt,
  Role,
  safeValidate,
  schema,
  System,
  Template,
  Tool,
  User,
  validate,
} from "./index";
import type { Infer } from "./index";

const role = "assistant";
const user = { isPremium: true };
const tasks = ["Task 1", "Task 2"];

const p = Prompt([
  System(`You are a ${role}.`),
  User("You must answer in markdown."),
  Assistant("Sure, I can help."),
  Tool("search: success"),
  Role("assistant", "Synthesizing response."),
  If(user.isPremium, "Please give detailed answers.", "Give short answers."),
  "Here are the tasks:",
  Join(
    Each(tasks, (t) => `- ${t}`),
    "\n",
  ),
  Template`Task count: ${tasks.length}`,
  Bracket("JSON mode", "(", ")"),
]);

p.render();
p.render({
  includeRoleLabels: true,
  roleLabelBrackets: ["<", ">"],
  roleLabelCase: "capitalize",
  roleLabelSuffix: " ",
  wrapper: ["BEGIN\n", "\nEND"],
});
p.toMessages();

const promptInputSchema = schema.object({
  topic: schema.string().trim().nonempty(),
  tone: schema.enum(["formal", "friendly"] as const),
  maxBullets: schema.number().int().min(1).default(3),
  tags: schema.array(schema.string()).nonempty().optional(),
  trimmedTopic: schema.string().transform((value) => value.trim()),
});

type PromptInput = Infer<typeof promptInputSchema>;
type PromptShape = InferShape<{
  topic: ReturnType<typeof schema.string>;
  tone: ReturnType<typeof schema.enum<["formal", "friendly"]>>;
}>;

const parsed = promptInputSchema.parse({
  topic: "refund policy",
  tone: "formal",
  trimmedTopic: "  refund policy  ",
});

const promptInput: PromptInput = {
  topic: "refund policy",
  tone: "friendly",
  maxBullets: 2,
  trimmedTopic: "refund policy",
};

const tone: "formal" | "friendly" = parsed.tone;
const maxBullets: number = parsed.maxBullets;
const maybeTags: string[] | undefined = parsed.tags;
const trimmedTopic: string = parsed.trimmedTopic;
const shapeInput: PromptShape = {
  topic: "refund policy",
  tone: "formal",
};

const contactSchema = schema.object({
  email: schema.string().trim().email(),
  website: schema.string().url(),
  slug: schema.string().startsWith("prompt-").endsWith("-guide"),
});

const contact = contactSchema.parse({
  email: "hello@example.com",
  website: "https://prompt-weave.dev",
  slug: "prompt-validation-guide",
});

const email: string = contact.email;
const website: string = contact.website;
const slug: string = contact.slug;

const buildValidatedPrompt = (input: {
  topic: string;
  tone: "formal" | "friendly";
  tags?: string[];
}) =>
  Prompt([
    System(`Topic: ${input.topic}`),
    input.tags ? Join(input.tags, ", ") : "No tags",
    `Tone: ${input.tone}`,
  ]);

const validatedPrompt = definePrompt(
  {
    topic: schema.string().trim().nonempty(),
    tone: schema.enum(["formal", "friendly"] as const),
    tags: schema.array(schema.string()).optional(),
  },
  buildValidatedPrompt,
);

validatedPrompt.build(promptInput).render();
validatedPrompt.render({
  topic: "returns",
  tone: "formal",
  trimmedTopic: "returns",
});

const directValidated = validate(
  {
    topic: schema.string().trim().nonempty(),
    tone: schema.enum(["formal", "friendly"] as const),
  },
  {
    topic: "refund policy",
    tone: "formal",
  },
);

const directTopic: string = directValidated.topic;
const directTone: "formal" | "friendly" = directValidated.tone;

const directPrompt = Prompt([
  System(`Topic: ${directValidated.topic}`),
  `Tone: ${directValidated.tone}`,
]);

directPrompt.render();

const safeValidated = safeValidate(
  {
    email: schema.string().email(),
  },
  { email: "hello@example.com" },
);

if (safeValidated.success) {
  const safeEmail: string = safeValidated.data.email;
  void safeEmail;
}

// @ts-expect-error missing required topic
const missingTopic: PromptInput = {
  tone: "formal",
  maxBullets: 2,
  trimmedTopic: "refund policy",
};

const invalidTone: PromptInput = {
  topic: "refund policy",
  // @ts-expect-error invalid tone literal
  tone: "casual",
  maxBullets: 2,
  trimmedTopic: "refund policy",
};

void tone;
void maxBullets;
void maybeTags;
void trimmedTopic;
void shapeInput;
void email;
void website;
void slug;
void directTopic;
void directTone;
void missingTopic;
void invalidTone;
