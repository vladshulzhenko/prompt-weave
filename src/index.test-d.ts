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
  Join(Each(tasks, (t) => `- ${t}`), "\n"),
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
