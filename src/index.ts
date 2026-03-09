export type PromptPrimitive = string | number | boolean;

export type PromptValue =
  | PromptPrimitive
  | PromptNode
  | InternalRoleChunk
  | ReadonlyArray<PromptValue>
  | null
  | undefined
  | false;

export type Role = "system" | "user" | "assistant" | "tool";

export interface PromptMessage {
  role: Role;
  content: string;
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

export type ValidationPath = ReadonlyArray<string | number>;

export interface ValidationIssue {
  path: ValidationPath;
  message: string;
  expected?: string;
  received?: string;
}

export class PromptValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(formatValidationIssues(issues));
    this.name = "PromptValidationError";
    this.issues = issues;
  }
}

export type SafeParseSuccess<T> = {
  success: true;
  data: T;
};

export type SafeParseFailure = {
  success: false;
  error: PromptValidationError;
};

export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

export interface Schema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): SafeParseResult<T>;
  optional(): Schema<T | undefined>;
  nullable(): Schema<T | null>;
  default(
    defaultValue: Exclude<T, undefined> | (() => Exclude<T, undefined>),
  ): Schema<Exclude<T, undefined>>;
  refine(check: (value: T) => boolean, message?: string): Schema<T>;
  transform<U>(map: (value: T) => U): Schema<U>;
}

export interface StringSchema extends Schema<string> {
  min(length: number, message?: string): StringSchema;
  max(length: number, message?: string): StringSchema;
  nonempty(message?: string): StringSchema;
  trim(): StringSchema;
  regex(pattern: RegExp, message?: string): StringSchema;
  startsWith(prefix: string, message?: string): StringSchema;
  endsWith(suffix: string, message?: string): StringSchema;
  email(message?: string): StringSchema;
  url(message?: string): StringSchema;
}

export interface NumberSchema extends Schema<number> {
  min(value: number, message?: string): NumberSchema;
  max(value: number, message?: string): NumberSchema;
  int(message?: string): NumberSchema;
  positive(message?: string): NumberSchema;
  nonnegative(message?: string): NumberSchema;
  negative(message?: string): NumberSchema;
}

export interface ArraySchema<
  TItem,
  TOutput extends TItem[] = TItem[],
> extends Schema<TOutput> {
  min(length: number, message?: string): ArraySchema<TItem, TOutput>;
  max(length: number, message?: string): ArraySchema<TItem, TOutput>;
  nonempty(message?: string): ArraySchema<TItem, [TItem, ...TItem[]]>;
}

export type Infer<TSchema extends Schema<unknown>> =
  TSchema extends Schema<infer TOutput> ? TOutput : never;

type Condition = boolean | (() => boolean);
type IterableOrFactory<T> = Iterable<T> | (() => Iterable<T>);
type SchemaShape = Record<string, Schema<unknown>>;
type OptionalSchemaKeys<TShape extends SchemaShape> = {
  [K in keyof TShape]: undefined extends Infer<TShape[K]> ? K : never;
}[keyof TShape];
type RequiredSchemaKeys<TShape extends SchemaShape> = Exclude<
  keyof TShape,
  OptionalSchemaKeys<TShape>
>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type InferObject<TShape extends SchemaShape> = Simplify<
  { [K in RequiredSchemaKeys<TShape>]: Infer<TShape[K]> } & {
    [K in OptionalSchemaKeys<TShape>]?: Exclude<Infer<TShape[K]>, undefined>;
  }
>;
export type InferShape<TShape extends SchemaShape> = InferObject<TShape>;
type PromptSource = PromptBuilder | readonly PromptValue[];
type ParseFn<T> = (input: unknown, context: ParseContext) => T | typeof INVALID;

const promptNodeSymbol: unique symbol = Symbol("PromptNode");
const schemaSymbol: unique symbol = Symbol("PromptSchema");
const INVALID = Symbol("PromptSchemaInvalid");

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

interface ParseContext {
  readonly path: ValidationPath;
  readonly issues: ValidationIssue[];
}

interface InternalSchema<T> extends Schema<T> {
  readonly [schemaSymbol]: true;
  _parse(input: unknown, context: ParseContext): T | typeof INVALID;
}

export interface PromptNode {
  readonly [promptNodeSymbol]: true;
  resolve(context: ResolveContext): PromptValue;
}

export interface PromptDefinition<TInput> {
  readonly schema: Schema<TInput>;
  parse(input: unknown): TInput;
  safeParse(input: unknown): SafeParseResult<TInput>;
  build(input: TInput): PromptBuilder;
  create(input: unknown): PromptBuilder;
  render(input: unknown, options?: PromptRenderOptions): string;
  toMessages(input: unknown): PromptMessage[];
}

function formatPath(path: ValidationPath): string {
  if (path.length === 0) {
    return "<input>";
  }

  return path.reduce<string>((current, segment) => {
    if (typeof segment === "number") {
      return `${current}[${segment}]`;
    }

    return current ? `${current}.${segment}` : segment;
  }, "");
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const detail = issue.expected
        ? ` Expected ${issue.expected}, received ${issue.received ?? "unknown"}.`
        : "";
      return `${formatPath(issue.path)}: ${issue.message}.${detail}`.trim();
    })
    .join("\n");
}

function pushIssue(
  context: ParseContext,
  message: string,
  input: unknown,
  expected?: string,
): typeof INVALID {
  context.issues.push({
    path: [...context.path],
    message,
    expected,
    received: describeValue(input),
  });
  return INVALID;
}

function nestContext(
  context: ParseContext,
  segment: string | number,
): ParseContext {
  return {
    path: [...context.path, segment],
    issues: context.issues,
  };
}

function createSchema<T>(parser: ParseFn<T>): InternalSchema<T> {
  const schema: InternalSchema<T> = {
    [schemaSymbol]: true,
    _parse: parser,
    parse(input) {
      const result = this.safeParse(input);
      if (!result.success) {
        throw result.error;
      }

      return result.data;
    },
    safeParse(input) {
      const issues: ValidationIssue[] = [];
      const context: ParseContext = { path: [], issues };
      const value = parser(input, context);

      if (value === INVALID || issues.length > 0) {
        return {
          success: false,
          error: new PromptValidationError(
            issues.length > 0
              ? issues
              : [
                  {
                    path: [],
                    message: "Invalid value",
                    received: describeValue(input),
                  },
                ],
          ),
        };
      }

      return { success: true, data: value };
    },
    optional() {
      return createSchema<T | undefined>((input, context) => {
        if (input === undefined) {
          return undefined;
        }

        return parser(input, context);
      });
    },
    nullable() {
      return createSchema<T | null>((input, context) => {
        if (input === null) {
          return null;
        }

        return parser(input, context);
      });
    },
    default(defaultValue) {
      return createSchema((input, context) => {
        if (input === undefined) {
          return typeof defaultValue === "function"
            ? (defaultValue as () => Exclude<T, undefined>)()
            : defaultValue;
        }

        return parser(input, context) as Exclude<T, undefined> | typeof INVALID;
      });
    },
    refine(check, message = "Invalid value") {
      return createSchema((input, context) => {
        const value = parser(input, context);
        if (value === INVALID) {
          return INVALID;
        }

        if (!check(value)) {
          return pushIssue(context, message, input);
        }

        return value;
      });
    },
    transform(map) {
      return createSchema((input, context) => {
        const value = parser(input, context);
        if (value === INVALID) {
          return INVALID;
        }

        return map(value);
      });
    },
  };

  return schema;
}

function createStringSchema(parser: ParseFn<string>): StringSchema {
  const base = createSchema(parser) as unknown as StringSchema;

  base.min = (length, message = `Expected at least ${length} characters`) =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.length < length
        ? pushIssue(context, message, input, `string(length >= ${length})`)
        : value;
    });

  base.max = (length, message = `Expected at most ${length} characters`) =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.length > length
        ? pushIssue(context, message, input, `string(length <= ${length})`)
        : value;
    });

  base.nonempty = (message = "Expected a non-empty string") =>
    base.min(1, message);

  base.trim = () =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.trim();
    });

  base.regex = (pattern, message = `Expected a string matching ${pattern}`) =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      pattern.lastIndex = 0;
      return pattern.test(value)
        ? value
        : pushIssue(context, message, input, `string(match ${pattern})`);
    });

  base.startsWith = (
    prefix,
    message = `Expected a string starting with ${JSON.stringify(prefix)}`,
  ) =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.startsWith(prefix)
        ? value
        : pushIssue(
            context,
            message,
            input,
            `string(startsWith ${JSON.stringify(prefix)})`,
          );
    });

  base.endsWith = (
    suffix,
    message = `Expected a string ending with ${JSON.stringify(suffix)}`,
  ) =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.endsWith(suffix)
        ? value
        : pushIssue(
            context,
            message,
            input,
            `string(endsWith ${JSON.stringify(suffix)})`,
          );
    });

  base.email = (message = "Expected a valid email address") =>
    base.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message);

  base.url = (message = "Expected a valid URL") =>
    createStringSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
          ? value
          : pushIssue(context, message, input, "URL(http/https)");
      } catch {
        return pushIssue(context, message, input, "URL(http/https)");
      }
    });

  return base;
}

function createNumberSchema(parser: ParseFn<number>): NumberSchema {
  const base = createSchema(parser) as unknown as NumberSchema;

  base.min = (minimum, message = `Expected a number >= ${minimum}`) =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value < minimum
        ? pushIssue(context, message, input, `number(>= ${minimum})`)
        : value;
    });

  base.max = (maximum, message = `Expected a number <= ${maximum}`) =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value > maximum
        ? pushIssue(context, message, input, `number(<= ${maximum})`)
        : value;
    });

  base.int = (message = "Expected an integer") =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return Number.isInteger(value)
        ? value
        : pushIssue(context, message, input, "integer");
    });

  base.positive = (message = "Expected a positive number") =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value > 0
        ? value
        : pushIssue(context, message, input, "number(> 0)");
    });

  base.nonnegative = (message = "Expected a non-negative number") =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value >= 0
        ? value
        : pushIssue(context, message, input, "number(>= 0)");
    });

  base.negative = (message = "Expected a negative number") =>
    createNumberSchema((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value < 0
        ? value
        : pushIssue(context, message, input, "number(< 0)");
    });

  return base;
}

function createArraySchema<TItem, TOutput extends TItem[] = TItem[]>(
  parser: ParseFn<TOutput>,
): ArraySchema<TItem, TOutput> {
  const base = createSchema(parser) as unknown as ArraySchema<TItem, TOutput>;

  base.min = (length, message = `Expected at least ${length} items`) =>
    createArraySchema<TItem, TOutput>((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.length < length
        ? pushIssue(context, message, input, `array(length >= ${length})`)
        : value;
    });

  base.max = (length, message = `Expected at most ${length} items`) =>
    createArraySchema<TItem, TOutput>((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.length > length
        ? pushIssue(context, message, input, `array(length <= ${length})`)
        : value;
    });

  base.nonempty = (message = "Expected a non-empty array") =>
    createArraySchema<TItem, [TItem, ...TItem[]]>((input, context) => {
      const value = parser(input, context);
      if (value === INVALID) {
        return INVALID;
      }

      return value.length === 0
        ? pushIssue(context, message, input, "non-empty array")
        : (value as unknown as [TItem, ...TItem[]]);
    });

  return base;
}

function asSchema<T>(value: Schema<T>): InternalSchema<T> {
  return value as InternalSchema<T>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function isPromptBuilder(value: unknown): value is PromptBuilder {
  return (
    typeof value === "object" &&
    value !== null &&
    "render" in value &&
    typeof (value as PromptBuilder).render === "function" &&
    "toMessages" in value &&
    typeof (value as PromptBuilder).toMessages === "function"
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

function toText(value: PromptValue, context: ResolveContext): string {
  return collectTokens(value, context)
    .map((token) => token.text)
    .join("\n");
}

function isIterableValue(value: unknown): value is Iterable<PromptValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.iterator in value &&
    typeof (value as Iterable<PromptValue>)[Symbol.iterator] === "function"
  );
}

function createPromptBuilder(parts: readonly PromptValue[]): PromptBuilder {
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

export const schema = {
  string(): StringSchema {
    return createStringSchema((input, context) => {
      if (typeof input !== "string") {
        return pushIssue(context, "Expected a string", input, "string");
      }

      return input;
    });
  },
  number(): NumberSchema {
    return createNumberSchema((input, context) => {
      if (typeof input !== "number" || !Number.isFinite(input)) {
        return pushIssue(context, "Expected a finite number", input, "number");
      }

      return input;
    });
  },
  boolean(): Schema<boolean> {
    return createSchema((input, context) => {
      if (typeof input !== "boolean") {
        return pushIssue(context, "Expected a boolean", input, "boolean");
      }

      return input;
    });
  },
  literal<const TValue extends PromptPrimitive>(value: TValue): Schema<TValue> {
    return createSchema((input, context) => {
      if (input !== value) {
        return pushIssue(
          context,
          `Expected the literal ${JSON.stringify(value)}`,
          input,
          JSON.stringify(value),
        );
      }

      return value;
    });
  },
  enum<const TValues extends readonly [PromptPrimitive, ...PromptPrimitive[]]>(
    values: TValues,
  ): Schema<TValues[number]> {
    const allowed = new Set<PromptPrimitive>(values);
    return createSchema((input, context) => {
      if (!allowed.has(input as PromptPrimitive)) {
        return pushIssue(
          context,
          `Expected one of ${values.map((value) => JSON.stringify(value)).join(", ")}`,
          input,
          values.map((value) => JSON.stringify(value)).join(" | "),
        );
      }

      return input as TValues[number];
    });
  },
  array<TItem>(item: Schema<TItem>): ArraySchema<TItem> {
    const itemSchema = asSchema(item);
    return createArraySchema<TItem>((input, context) => {
      if (!Array.isArray(input)) {
        return pushIssue(context, "Expected an array", input, "array");
      }

      const initialIssueCount = context.issues.length;
      const output: TItem[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const value = itemSchema._parse(
          input[index],
          nestContext(context, index),
        );
        if (value !== INVALID) {
          output.push(value);
        }
      }

      return context.issues.length > initialIssueCount ? INVALID : output;
    });
  },
  object<TShape extends SchemaShape>(
    shape: TShape,
  ): Schema<InferObject<TShape>> {
    return createSchema((input, context) => {
      if (!isPlainObject(input)) {
        return pushIssue(context, "Expected an object", input, "object");
      }

      const initialIssueCount = context.issues.length;
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(shape) as Array<keyof TShape>) {
        const fieldSchema = shape[key] as Schema<unknown>;
        const value = asSchema(fieldSchema)._parse(
          input[key as string],
          nestContext(context, key as string),
        );

        if (value !== INVALID && value !== undefined) {
          output[key as string] = value;
        }
      }

      return context.issues.length > initialIssueCount
        ? INVALID
        : (output as InferObject<TShape>);
    });
  },
};

function isSchema(value: unknown): value is Schema<unknown> {
  return typeof value === "object" && value !== null && schemaSymbol in value;
}

function asObjectSchema<TShape extends SchemaShape>(
  shape: TShape,
): Schema<InferObject<TShape>> {
  return schema.object(shape);
}

function normalizeSchemaInput<
  TShape extends SchemaShape,
  TSchema extends Schema<unknown>,
>(
  inputSchemaOrShape: TSchema | TShape,
): Schema<Infer<TSchema> | InferObject<TShape>> {
  return (
    isSchema(inputSchemaOrShape)
      ? inputSchemaOrShape
      : asObjectSchema(inputSchemaOrShape as TShape)
  ) as Schema<Infer<TSchema> | InferObject<TShape>>;
}

export function validate<TShape extends SchemaShape>(
  shape: TShape,
  input: unknown,
): InferObject<TShape>;
export function validate<TSchema extends Schema<unknown>>(
  inputSchema: TSchema,
  input: unknown,
): Infer<TSchema>;
export function validate<
  TShape extends SchemaShape,
  TSchema extends Schema<unknown>,
>(
  inputSchemaOrShape: TSchema | TShape,
  input: unknown,
): Infer<TSchema> | InferObject<TShape> {
  const typedSchema = normalizeSchemaInput(inputSchemaOrShape) as Schema<
    Infer<TSchema> | InferObject<TShape>
  >;
  return typedSchema.parse(input);
}

export function safeValidate<TShape extends SchemaShape>(
  shape: TShape,
  input: unknown,
): SafeParseResult<InferObject<TShape>>;
export function safeValidate<TSchema extends Schema<unknown>>(
  inputSchema: TSchema,
  input: unknown,
): SafeParseResult<Infer<TSchema>>;
export function safeValidate<
  TShape extends SchemaShape,
  TSchema extends Schema<unknown>,
>(
  inputSchemaOrShape: TSchema | TShape,
  input: unknown,
): SafeParseResult<Infer<TSchema> | InferObject<TShape>> {
  const typedSchema = normalizeSchemaInput(inputSchemaOrShape) as Schema<
    Infer<TSchema> | InferObject<TShape>
  >;
  return typedSchema.safeParse(input);
}

export function definePrompt<TShape extends SchemaShape>(
  inputShape: TShape,
  build: (input: InferObject<TShape>) => PromptSource,
): PromptDefinition<InferObject<TShape>>;
export function definePrompt<TSchema extends Schema<unknown>>(
  inputSchema: TSchema,
  build: (input: Infer<TSchema>) => PromptSource,
): PromptDefinition<Infer<TSchema>>;
export function definePrompt<
  TShape extends SchemaShape,
  TSchema extends Schema<unknown>,
>(
  inputSchemaOrShape: TSchema | TShape,
  build:
    | ((input: Infer<TSchema>) => PromptSource)
    | ((input: InferObject<TShape>) => PromptSource),
): PromptDefinition<Infer<TSchema> | InferObject<TShape>> {
  const typedSchema = normalizeSchemaInput(inputSchemaOrShape) as Schema<
    Infer<TSchema> | InferObject<TShape>
  >;
  const normalize = (source: PromptSource): PromptBuilder =>
    isPromptBuilder(source) ? source : createPromptBuilder(source);
  const builder = build as (
    input: Infer<TSchema> | InferObject<TShape>,
  ) => PromptSource;

  return {
    schema: typedSchema,
    parse(input) {
      return typedSchema.parse(input);
    },
    safeParse(input) {
      return typedSchema.safeParse(input);
    },
    build(input) {
      return normalize(builder(input));
    },
    create(input) {
      return normalize(builder(typedSchema.parse(input)));
    },
    render(input, options) {
      return this.create(input).render(options);
    },
    toMessages(input) {
      return this.create(input).toMessages();
    },
  };
}

export function Role(role: Role, content: PromptValue): PromptNode {
  return createNode(() => roleChunk(role, content));
}

export function System(content: PromptValue): PromptNode {
  return Role("system", content);
}

export function User(content: PromptValue): PromptNode {
  return Role("user", content);
}

export function Assistant(content: PromptValue): PromptNode {
  return Role("assistant", content);
}

export function Tool(content: PromptValue): PromptNode {
  return Role("tool", content);
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

export function Join(
  items: PromptValue | IterableOrFactory<PromptValue>,
  separator: PromptValue = "\n",
): PromptNode {
  return createNode((context) => {
    const separatorText = toText(separator, context);
    const parts: string[] = [];

    const resolved = typeof items === "function" ? items() : items;
    if (isIterableValue(resolved)) {
      for (const item of resolved) {
        const text = toText(item, context);
        if (text.trim()) {
          parts.push(text);
        }
      }

      return parts.join(separatorText);
    }

    for (const token of collectTokens(resolved, context)) {
      if (token.text.trim()) {
        parts.push(token.text);
      }
    }

    return parts.join(separatorText);
  });
}

export function Template(
  strings: TemplateStringsArray,
  ...values: readonly PromptValue[]
): PromptNode {
  return createNode((context) => {
    let text = "";

    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i];

      if (i < values.length) {
        text += toText(values[i], context);
      }
    }

    return text;
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

export function Prompt(parts: readonly PromptValue[]): PromptBuilder {
  return createPromptBuilder(parts);
}
