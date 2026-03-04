export type PromptPrimitive = string | number | boolean;

export type PromptValue =
  | PromptPrimitive
  | PromptNode
  | InternalRoleChunk
  | PromptValue[]
  | null
  | undefined
  | false;

export type Role = "system" | "user" | "assistant" | "tool";

export interface PromptMessage {
  role: Role;
  content: string;
}

const promptNodeSymbol: unique symbol = Symbol("PromptNode");

interface ResolveContext {
  defaultRole: Role;
}

interface Token {
  role: Role;
  text: string;
}

interface InternalRoleChunk {
  readonly __internalRoleChunk: true;
  role: Role;
  value: PromptValue;
}

export interface PromptNode {
  readonly [promptNodeSymbol]: true;
  resolve(context: ResolveContext): PromptValue;
}

export interface PromptRenderOptions {
  separator?: string;
  systemPrefix?: string;
  includeRoleLabels?: boolean;
  roleLabelCase?: "upper" | "lower" | "capitalize" | "none";
  roleLabelBrackets?: readonly [string, string];
  roleLabelSuffix?: string;
  wrapper?: readonly [string, string];
}

export interface PromptBuilder {
  render(options?: PromptRenderOptions): string;
  toMessages(): PromptMessage[];
}

type Condition = boolean | (() => boolean);

type IterableOrFactory<T> = Iterable<T> | (() => Iterable<T>);

function createNode(
  resolve: (context: ResolveContext) => PromptValue,
): PromptNode {
  return {
    [promptNodeSymbol]: true,
    resolve,
  };
}

function roleChunk(role: Role, value: PromptValue): InternalRoleChunk {
  return {
    __internalRoleChunk: true,
    role,
    value,
  };
}

function isNode(value: unknown): value is PromptNode {
  return (
    typeof value === "object" && value !== null && promptNodeSymbol in value
  );
}

function isRoleChunk(value: unknown): value is InternalRoleChunk {
  return (
    typeof value === "object" &&
    value !== null &&
    "__internalRoleChunk" in value &&
    (value as InternalRoleChunk).__internalRoleChunk === true
  );
}

function normalizePrimitive(value: PromptPrimitive): string {
  return String(value);
}

function formatRoleLabel(
  role: Role,
  roleLabelCase: NonNullable<PromptRenderOptions["roleLabelCase"]>,
): string {
  if (roleLabelCase === "none") {
    return role;
  }

  if (roleLabelCase === "upper") {
    return role.toUpperCase();
  }

  if (roleLabelCase === "lower") {
    return role.toLowerCase();
  }

  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function collectTokens(value: PromptValue, context: ResolveContext): Token[] {
  if (value === null || value === undefined || value === false) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((part) => collectTokens(part, context));
  }

  if (isNode(value)) {
    return collectTokens(value.resolve(context), context);
  }

  if (isRoleChunk(value)) {
    return collectTokens(value.value, { ...context, defaultRole: value.role });
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [{ role: context.defaultRole, text: normalizePrimitive(value) }];
  }

  return [];
}

function mergeTokens(tokens: Token[]): PromptMessage[] {
  const messages: PromptMessage[] = [];

  for (const token of tokens) {
    const text = token.text.trim();
    if (!text) {
      continue;
    }

    const last = messages.at(-1);
    if (last && last.role === token.role) {
      last.content = `${last.content}\n${text}`;
      continue;
    }

    messages.push({ role: token.role, content: text });
  }

  return messages;
}

export function System(content: PromptValue): PromptNode {
  return createNode(() => roleChunk("system", content));
}

export function If(
  condition: Condition,
  whenTrue: PromptValue,
  whenFalse: PromptValue = "",
): PromptNode {
  return createNode(() => {
    const result = typeof condition === "function" ? condition() : condition;
    return result ? whenTrue : whenFalse;
  });
}

export function Each<T>(
  items: IterableOrFactory<T>,
  map: (item: T, index: number) => PromptValue,
): PromptNode {
  return createNode(() => {
    const iterable = typeof items === "function" ? items() : items;
    const output: PromptValue[] = [];

    let index = 0;
    for (const item of iterable) {
      output.push(map(item, index));
      index += 1;
    }

    return output;
  });
}

export function Bracket(
  content: PromptValue,
  left = "[",
  right = "]",
): PromptNode {
  return createNode((context) => {
    const tokens = collectTokens(content, context);

    return tokens.map((token) =>
      roleChunk(token.role, `${left}${token.text}${right}`),
    );
  });
}

export function Prompt(parts: PromptValue[]): PromptBuilder {
  return {
    toMessages() {
      const tokens = collectTokens(parts, { defaultRole: "user" });
      return mergeTokens(tokens);
    },
    render(options) {
      const separator = options?.separator ?? "\n\n";
      const systemPrefix = options?.systemPrefix ?? "System: ";
      const includeRoleLabels = options?.includeRoleLabels ?? false;
      const roleLabelCase = options?.roleLabelCase ?? "upper";
      const roleLabelBrackets =
        options?.roleLabelBrackets ?? (["[", "]"] as const);
      const roleLabelSuffix = options?.roleLabelSuffix ?? " ";
      const wrapper = options?.wrapper;

      const rendered = this.toMessages()
        .map((message) => {
          if (includeRoleLabels) {
            const [leftBracket, rightBracket] = roleLabelBrackets;
            const roleLabel = formatRoleLabel(message.role, roleLabelCase);
            return `${leftBracket}${roleLabel}${rightBracket}${roleLabelSuffix}${message.content}`;
          }

          if (message.role === "system") {
            return `${systemPrefix}${message.content}`;
          }

          return message.content;
        })
        .join(separator);

      if (!wrapper) {
        return rendered;
      }

      const [wrapperOpen, wrapperClose] = wrapper;
      return `${wrapperOpen}${rendered}${wrapperClose}`;
    },
  };
}
