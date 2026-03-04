import { Prompt, System, If, Each, Bracket } from "./index";

const role = "assistant";
const user = { isPremium: true };
const tasks = ["Task 1", "Task 2"];

const p = Prompt([
  System(`You are a ${role}.`),
  If(user.isPremium, "Please give detailed answers.", "Give short answers."),
  "Here are the tasks:",
  Each(tasks, (t) => `- ${t}`),
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
