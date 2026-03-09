import { describe, expect, it } from "vitest";

import {
  Assistant,
  Bracket,
  definePrompt,
  Each,
  If,
  Join,
  Prompt,
  PromptValidationError,
  Role,
  safeValidate,
  schema,
  System,
  Template,
  Tool,
  User,
  validate,
} from "./index";

describe("just-prompt", () => {
  it("renders the base DSL example", () => {
    const role = "travel assistant";
    const user = { isPremium: true };
    const tasks = ["Plan a 3-day trip", "Include budget options"];

    const prompt = Prompt([
      System(`You are a ${role}.`),
      If(
        user.isPremium,
        "Please give detailed answers.",
        "Give short answers.",
      ),
      "Here are the tasks:",
      Each(tasks, (task) => `- ${task}`),
    ]);

    expect(prompt.render()).toBe(
      [
        "System: You are a travel assistant.",
        "Please give detailed answers.\nHere are the tasks:\n- Plan a 3-day trip\n- Include budget options",
      ].join("\n\n"),
    );
  });

  it("returns role-aware messages", () => {
    const prompt = Prompt([
      System("You are a coding assistant."),
      "Solve task A",
      "Then task B",
    ]);

    expect(prompt.toMessages()).toEqual([
      { role: "system", content: "You are a coding assistant." },
      { role: "user", content: "Solve task A\nThen task B" },
    ]);
  });

  it("supports function conditions and lazy iterables", () => {
    const isPremium = () => false;
    const tasks = () => ["A", "B", "C"];

    const prompt = Prompt([
      If(isPremium, "Detailed", "Short"),
      Each(tasks, (task, index) => `${index + 1}. ${task}`),
    ]);

    expect(prompt.render({ separator: "\n" })).toBe("Short\n1. A\n2. B\n3. C");
  });

  it("supports bracket helpers and role label rendering", () => {
    const prompt = Prompt([
      System("Follow policy."),
      Bracket("Return JSON only", "(", ")"),
      "Answer the question",
    ]);

    expect(
      prompt.render({
        includeRoleLabels: true,
        roleLabelBrackets: ["<", ">"],
        roleLabelCase: "capitalize",
      }),
    ).toBe(
      "<System> Follow policy.\n\n<User> (Return JSON only)\nAnswer the question",
    );
  });

  it("supports full-wrapper formatting", () => {
    const prompt = Prompt(["A", "B"]);

    expect(
      prompt.render({
        separator: " | ",
        wrapper: ["BEGIN:", ":END"],
      }),
    ).toBe("BEGIN:A\nB:END");
  });

  it("supports Role helpers for all message roles", () => {
    const prompt = Prompt([
      System("Policy"),
      User("Question"),
      Assistant("Draft answer"),
      Tool("Tool output"),
      Role("assistant", "Final answer"),
    ]);

    expect(prompt.toMessages()).toEqual([
      { role: "system", content: "Policy" },
      { role: "user", content: "Question" },
      { role: "assistant", content: "Draft answer" },
      { role: "tool", content: "Tool output" },
      { role: "assistant", content: "Final answer" },
    ]);
  });

  it("supports Join for iterable prompt parts", () => {
    const prompt = Prompt([Join(["alpha", "beta", "gamma"], " | ")]);

    expect(prompt.render()).toBe("alpha | beta | gamma");
  });

  it("supports Template tagged interpolation with prompt nodes", () => {
    const topic = "refund policy";
    const rules = ["Be concise", "Use bullets"];

    const prompt = Prompt([
      System("You are a support assistant."),
      Template`Handle topic: ${topic}. ${Bracket(
        "Return JSON only",
        "(",
        ")",
      )}`,
      "Rules:",
      Join(
        Each(rules, (rule) => `- ${rule}`),
        "\n",
      ),
    ]);

    expect(prompt.toMessages()).toEqual([
      { role: "system", content: "You are a support assistant." },
      {
        role: "user",
        content:
          "Handle topic: refund policy. (Return JSON only)\nRules:\n- Be concise\n- Use bullets",
      },
    ]);
  });

  it("validates typed prompt inputs with zod-like schemas", () => {
    const supportPrompt = definePrompt(
      {
        topic: schema.string().trim().nonempty(),
        audience: schema.enum(["free", "pro"] as const),
        maxBullets: schema.number().int().min(1).default(3),
        constraints: schema
          .array(schema.string().trim().nonempty())
          .default(() => []),
      },
      ({ topic, audience, maxBullets, constraints }) => [
        System("You are a support assistant."),
        `Topic: ${topic}`,
        `Audience: ${audience}`,
        `Limit: ${maxBullets} bullets`,
        Join(
          Each(constraints, (constraint) => `- ${constraint}`),
          "\n",
        ),
      ],
    );

    expect(
      supportPrompt.render({
        topic: "refund policy",
        audience: "pro",
        constraints: ["Use bullets", "Stay concise"],
      }),
    ).toBe(
      [
        "System: You are a support assistant.",
        "Topic: refund policy\nAudience: pro\nLimit: 3 bullets\n- Use bullets\n- Stay concise",
      ].join("\n\n"),
    );
  });

  it("returns structured validation issues for invalid prompt data", () => {
    const inputSchema = schema.object({
      topic: schema.string().trim().nonempty(),
      constraints: schema.array(schema.string()).nonempty().optional(),
      tone: schema.enum(["formal", "friendly"] as const),
    });

    const result = inputSchema.safeParse({
      topic: 42,
      constraints: ["valid", 123],
      tone: "casual",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual([
      {
        path: ["topic"],
        message: "Expected a string",
        expected: "string",
        received: "number",
      },
      {
        path: ["constraints", 1],
        message: "Expected a string",
        expected: "string",
        received: "number",
      },
      {
        path: ["tone"],
        message: 'Expected one of "formal", "friendly"',
        expected: '"formal" | "friendly"',
        received: "string",
      },
    ]);
  });

  it("throws PromptValidationError when validated prompt input is invalid", () => {
    const supportPrompt = definePrompt(
      {
        topic: schema.string().trim().min(3),
      },
      ({ topic }) => Prompt([System("You are a support assistant."), topic]),
    );

    expect(() => supportPrompt.render({ topic: 123 })).toThrow(
      PromptValidationError,
    );
    expect(supportPrompt.render({ topic: "  refunds  " })).toBe(
      "System: You are a support assistant.\n\nrefunds",
    );
  });

  it("supports richer built-in validators without refine", () => {
    const validator = schema.object({
      title: schema.string().trim().min(3).max(10),
      count: schema.number().int().positive(),
      tags: schema.array(schema.string()).nonempty().max(3),
    });

    expect(
      validator.parse({
        title: "  Hello  ",
        count: 2,
        tags: ["a", "b"],
      }),
    ).toEqual({
      title: "Hello",
      count: 2,
      tags: ["a", "b"],
    });

    const result = validator.safeParse({
      title: "hi",
      count: 0,
      tags: [],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual([
      {
        path: ["title"],
        message: "Expected at least 3 characters",
        expected: "string(length >= 3)",
        received: "string",
      },
      {
        path: ["count"],
        message: "Expected a positive number",
        expected: "number(> 0)",
        received: "number",
      },
      {
        path: ["tags"],
        message: "Expected a non-empty array",
        expected: "non-empty array",
        received: "array",
      },
    ]);
  });

  it("supports email, url, regex, startsWith, and endsWith validators", () => {
    const validator = schema.object({
      email: schema.string().trim().email(),
      website: schema.string().url(),
      slug: schema
        .string()
        .startsWith("prompt-")
        .endsWith("-guide")
        .regex(/^prompt-[a-z-]+-guide$/),
    });

    expect(
      validator.parse({
        email: "  hello@example.com  ",
        website: "https://prompt-weave.dev/docs",
        slug: "prompt-validation-guide",
      }),
    ).toEqual({
      email: "hello@example.com",
      website: "https://prompt-weave.dev/docs",
      slug: "prompt-validation-guide",
    });

    const result = validator.safeParse({
      email: "not-an-email",
      website: "ftp://prompt-weave.dev",
      slug: "validation-guide",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual([
      {
        path: ["email"],
        message: "Expected a valid email address",
        expected: "string(match /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)",
        received: "string",
      },
      {
        path: ["website"],
        message: "Expected a valid URL",
        expected: "URL(http/https)",
        received: "string",
      },
      {
        path: ["slug"],
        message: 'Expected a string starting with "prompt-"',
        expected: 'string(startsWith "prompt-")',
        received: "string",
      },
    ]);
  });

  it("validates data directly without definePrompt build helpers", () => {
    const input = validate(
      {
        topic: schema.string().trim().nonempty(),
        audience: schema.enum(["free", "pro"] as const),
        constraints: schema.array(schema.string().trim()).default(() => []),
      },
      {
        topic: "  refund policy  ",
        audience: "pro",
        constraints: [" Use bullets ", "Stay concise"],
      },
    );

    const prompt = Prompt([
      System("You are a support assistant."),
      `Topic: ${input.topic}`,
      `Audience: ${input.audience}`,
      Join(
        Each(input.constraints, (constraint) => `- ${constraint}`),
        "\n",
      ),
    ]);

    expect(prompt.render()).toBe(
      [
        "System: You are a support assistant.",
        "Topic: refund policy\nAudience: pro\n- Use bullets\n- Stay concise",
      ].join("\n\n"),
    );
  });

  it("supports safeValidate for ad-hoc prompt inputs", () => {
    const result = safeValidate(
      {
        email: schema.string().email(),
        website: schema.string().url(),
      },
      {
        email: "bad",
        website: "https://prompt-weave.dev",
      },
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual([
      {
        path: ["email"],
        message: "Expected a valid email address",
        expected: "string(match /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)",
        received: "string",
      },
    ]);
  });
});
