import { describe, expect, it } from "vitest";

import {
  Assistant,
  Bracket,
  Each,
  If,
  Join,
  Prompt,
  Role,
  System,
  Template,
  Tool,
  User,
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
      Template`Handle topic: ${topic}. ${Bracket("Return JSON only", "(", ")")}`,
      "Rules:",
      Join(Each(rules, (rule) => `- ${rule}`), "\n"),
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
});
