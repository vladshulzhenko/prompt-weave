import { describe, expect, it } from "vitest";

import { Bracket, Each, If, Prompt, System } from "./index";

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
});
