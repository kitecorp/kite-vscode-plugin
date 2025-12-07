# Kite VS Code Extension - Development Guide

## Overview

This is the VS Code extension for the Kite language. It should mirror the features of the IntelliJ plugin located at `../kite-intellij-plugin`.

## Reference Implementation

The IntelliJ plugin at `../kite-intellij-plugin` is the reference implementation. Use it to understand:
- Language syntax and semantics
- Feature behavior expectations
- Test files in `../kite-intellij-plugin/examples/`

## Language Documentation

The authoritative Kite language documentation is in the `../kite` project:

| Document | Path | Description |
|----------|------|-------------|
| Decorators | `../kite-language/docs/DECORATORS.md` | All 17 built-in decorators with targets and examples |
| Syntax | `../kite/lang/docs/SYNTAX.md` | Language syntax reference |
| Grammar | `grammar/*.g4` | ANTLR grammar (source of truth for parsing) |

**Important:** Always check `../kite-language/docs/DECORATORS.md` for the current list of decorators. The VS Code plugin's `constants.ts` must match this documentation.

## Development Principles

1. **Apply existing patterns first** - Look for similar working code before creating new solutions
2. **Ask questions when unsure** - Clarify requirements before coding
3. **Listen to user hints** - Try user suggestions first
4. **Debug actual problems** - Focus on what's actually broken
5. **Prefer simple solutions** - Complexity should match the problem
6. **When stuck, step back** - Look at similar working code

## Code Quality Standards

We follow these engineering practices:

- **TDD (Test-Driven Development)** - Write tests first, then implementation (see below)
- **CLEAN Code** - Readable, maintainable, and well-organized code
- **SOLID Principles**:
  - Single Responsibility - Each module/class has one reason to change
  - Open/Closed - Open for extension, closed for modification
  - Liskov Substitution - Subtypes must be substitutable for base types
  - Interface Segregation - Many specific interfaces over one general interface
  - Dependency Inversion - Depend on abstractions, not concretions
- **DRY (Don't Repeat Yourself)** - Avoid code duplication, extract shared logic

## File Size Guidelines

Keep files small and focused. Large files are hard to navigate, test, and maintain.

### Size Limits

| File Type | Soft Limit | Hard Limit | Action |
|-----------|------------|------------|--------|
| Handler (`index.ts`) | 300 lines | 500 lines | Split into modules |
| Utility module | 200 lines | 400 lines | Extract related functions |
| Test file | 400 lines | 700 lines | Split by feature/scenario |
| Type definitions | 150 lines | 300 lines | Group related types |

### When to Split

Split a file when:
- It exceeds the soft limit (~300 lines for handlers)
- It has multiple distinct responsibilities
- You find yourself scrolling to find functions
- Tests are hard to organize

### How to Split

Follow the established pattern in `handlers/`:

```
handlers/feature/
├── index.ts           # Main handler + re-exports (thin orchestration layer)
├── types.ts           # Context interface and types
├── utils.ts           # Helper utilities
├── specific-logic.ts  # Focused modules by responsibility
└── feature.test.ts    # Tests
```

**Key principles:**
1. **Single Responsibility** - Each file handles one aspect
2. **index.ts is thin** - Only orchestration and re-exports (~100-150 lines)
3. **Group by functionality** - Not by code type
4. **Re-export from index** - Maintain clean public API

### Examples

Good splits:
- `completion/decorators.ts` - All decorator completion logic
- `definition/type-definitions.ts` - Schema/component/function lookup
- `references/loop-scope.ts` - Loop variable scope detection

Bad splits:
- `helpers.ts` - Generic grab-bag of utilities
- `part1.ts`, `part2.ts` - Arbitrary splits by line count

## Test-Driven Development (TDD)

When developing new features, follow the TDD cycle:

1. **Red** - Write a failing test first
   - Define expected behavior before implementation
   - Test should fail because the feature doesn't exist yet

2. **Green** - Write minimal code to pass the test
   - Focus only on making the test pass
   - Don't over-engineer or add extra features

3. **Refactor** - Clean up the code
   - Improve structure while keeping tests green
   - Remove duplication, improve naming

### TDD Workflow Example

```bash
# 1. Create test file first (if new handler)
# src/server/handlers/my-feature.test.ts

# 2. Write failing tests
npm test  # Should fail

# 3. Implement the feature
# src/server/handlers/my-feature.ts

# 4. Run tests until green
npm test  # Should pass

# 5. Refactor and verify tests still pass
npm test
```

### Test File Conventions

- Test files live next to source: `foo.ts` → `foo.test.ts`
- Use Vitest: `describe`, `it`, `expect`
- Mock TextDocument for handler tests
- Run tests with `npm test`


## Kite Language Quick Reference

```kite
// Imports
import * from "common.kite"
import * from "aws.DatabaseConfig"  // Package-style path

// Type alias (union type)
type Region = "us-east-1" | "us-west-2" | "eu-west-1"

// Schema definition (like interface/struct)
schema ServerConfig {
  string   host
  number   port     = 8080
  boolean  ssl      = true
  string[] tags              // Array type
  any      metadata          // Any type
  @cloud string arn          // Cloud-generated property
}

// Resource instantiation (uses a schema)
resource ServerConfig webServer {
  host = "localhost"
  port = 3000
  tags = ["web", "production"]
}

// Variable declarations
var string explicitType = "hello"
var inferredType = "world"

// Function declaration
fun calculateCost(number instances, string tier) number {
  var baseCost = 0.10
  return instances * baseCost
}

// Component (reusable module with inputs/outputs)
component WebServer {
  input string name = "default"
  input number replicas = 1
  output string endpoint = "http://${name}.example.com"
}

// Component instantiation
component WebServer api {
  name = "payments"
  replicas = 3
}

// Decorators (annotations)
@provider(["aws", "gcp"])
@tags({Environment: "production"})
resource VM.Instance server { }

// String interpolation
var greeting = "Hello, ${name}!"
var simple = "Value: $value"

// Multiline strings (both quote types supported)
var message = "This is a
multiline
string"

var singleQuoted = 'Also supports
multiline
with single quotes'

var withInterpolation = "Line 1
${variable}
Line 3"

// Control flow
if condition {
  // ...
} else {
  // ...
}

for item in items {
  // ...
}

while condition {
  // ...
}
```

## Token Types

Key tokens from the ANTLR lexer (`../kite-intellij-plugin/src/main/antlr/cloud/kitelang/intellij/parser/KiteLexer.g4`):

### Keywords
- IaC: `resource`, `component`, `schema`, `input`, `output`
- Control: `if`, `else`, `while`, `for`, `in`, `return`
- Declarations: `import`, `from`, `fun`, `var`, `type`, `init`, `this`
- Types: `object`, `any`
- Literals: `true`, `false`, `null`

### Operators
- Arithmetic: `+`, `-`, `*`, `/`, `%`, `++`, `--`
- Relational: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Logical: `&&`, `||`, `!`
- Assignment: `=`, `+=`, `-=`, `*=`, `/=`
- Other: `@`, `.`, `->`, `..`, `|`

### Delimiters
- `(`, `)`, `{`, `}`, `[`, `]`, `,`, `:`, `;`

### String Interpolation
- Double-quoted strings support `${expr}` and `$identifier`
- Single-quoted strings are literal (no interpolation)

## Implemented Features

### Basic Language Support
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Syntax Highlighting | `KiteSyntaxHighlighter.java` | TextMate grammar | ✅ |
| Bracket Matching | Built-in | `language-configuration.json` | ✅ |
| Comment Toggling | Built-in | `language-configuration.json` | ✅ |
| Code Folding | Built-in | TextMate regions | ✅ |

### Semantic Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Go to Definition | `KiteGotoDeclarationHandler.java` | `textDocument/definition` | ✅ |
| Find References | `KiteReferenceContributor.java` | `textDocument/references` | ✅ |
| Autocomplete | `KiteCompletionContributor.java` | `textDocument/completion` | ✅ |
| Hover/Quick Docs | `KiteDocumentationProvider.java` | `textDocument/hover` | ✅ |
| Parameter Hints | `KiteParameterInfoHandler.java` | `textDocument/signatureHelp` | ✅ |
| Cross-file Navigation | `KiteGotoDeclarationHandler.java` | `textDocument/definition` | ✅ |
| Property Navigation | - | `textDocument/definition` | ✅ |

### Diagnostics & Validation
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Import Validation | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Decorator Validation | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Duplicate Name Detection | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Quick Fix: Add Import | - | `textDocument/codeAction` | ✅ |

### Smart Autocomplete
| Feature | Description | Status |
|---------|-------------|--------|
| Scope-aware Variables | Only shows variables in current scope | ✅ |
| Priority Ordering | inputs → variables → resources → components → outputs → functions | ✅ |
| Schema Property Completion | Inside resource bodies | ✅ |
| Component Input Completion | Inside component instances | ✅ |
| DevOps-aware Defaults | Ports, regions, CIDRs, instance types, etc. | ✅ |
| Context-aware in Schemas | Type-appropriate suggestions for defaults | ✅ |
| Context-aware in Components | Type-appropriate suggestions for input/output defaults | ✅ |

### Navigation & Structure
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Document Symbols | `KiteStructureViewElement.java` | `textDocument/documentSymbol` | ✅ |
| Inlay Hints | `KiteInlayHintsProvider.java` | `textDocument/inlayHint` | ✅ |

### Refactoring
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Rename Symbol | - | `textDocument/rename` | ✅ |

### Core Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Code Formatting | `KiteBlock.java` | `textDocument/formatting` | ✅ |
| Type Checking | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |

### All Features Complete

All planned LSP features have been implemented. See `docs/features.md` for detailed documentation of all 27 features and 44+ validation checks.

## Project Structure

```
kite-vscode-plugin/
├── CLAUDE.md                    # Development guide (this file)
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript config
├── language-configuration.json  # Brackets, comments, folding
├── grammar/                     # ANTLR grammar files (source of truth)
│   ├── KiteLexer.g4            # Lexer rules (tokens)
│   └── KiteParser.g4           # Parser rules (AST)
├── scripts/
│   └── fix-lexer.js            # Post-processes generated lexer for TypeScript
├── src/
│   ├── extension.ts            # Extension entry point (client activation)
│   ├── parser/                 # ANTLR-generated parser
│   │   ├── index.ts            # Parser exports
│   │   ├── parse-utils.ts      # Parsing utilities
│   │   └── grammar/            # Generated files (npm run generate-parser)
│   │       ├── KiteLexer.ts    # Generated lexer
│   │       ├── KiteParser.ts   # Generated parser
│   │       └── KiteParserVisitor.ts  # Visitor interface
│   └── server/
│       ├── server.ts           # Language server main
│       ├── scanner.ts          # Document scanner for declarations
│       ├── types.ts            # Shared type definitions
│       ├── constants.ts        # Language constants (keywords, decorators)
│       ├── handlers/           # LSP request handlers
│       │   ├── completion.ts   # Code completion
│       │   ├── devops-suggestions.ts  # DevOps-aware value suggestions
│       │   ├── definition.ts   # Go to definition
│       │   ├── references.ts   # Find references
│       │   ├── rename.ts       # Rename symbol
│       │   ├── hover.ts        # Hover documentation
│       │   ├── validation.ts   # Diagnostics & validation
│       │   ├── code-actions.ts # Quick fixes
│       │   ├── document-symbols.ts  # Outline view
│       │   ├── signature-help.ts    # Parameter hints
│       │   └── inlay-hints.ts       # Inline type hints
│       └── utils/              # Utility functions
│           ├── text-utils.ts   # Text, file & block utilities
│           ├── import-utils.ts # Import parsing
│           └── rename-utils.ts # Rename/reference utilities
├── syntaxes/
│   └── kite.tmLanguage.json    # TextMate grammar (syntax highlighting)
└── examples/                   # Test files
```

## ANTLR Parser

The grammar files (`grammar/*.g4`) are the **source of truth** for the Kite language syntax. These are shared with the IntelliJ plugin and use Java syntax for action blocks.

### Prerequisites

- ANTLR 4.13+ installed (`brew install antlr` on macOS)
- Node.js for post-processing script

### Regenerating the Parser

When grammar files change, regenerate the TypeScript parser:

```bash
npm run generate-parser
```

This:
1. Generates TypeScript from `grammar/*.g4` files
2. Runs `scripts/fix-lexer.js` to convert Java action code to TypeScript
3. Outputs files to `src/parser/grammar/`

Generated files are gitignored - regenerate after cloning.

### Using the Parser

```typescript
import { parseKite, tokenize, KiteLexer } from '../parser';

// Parse source code to AST
const result = parseKite(sourceCode);
if (result.errors.length === 0) {
    // result.tree is the AST root (ProgramContext)
}

// Tokenize source code
const tokens = tokenize(sourceCode);

// Check token types
if (tokens[0].type === KiteLexer.VAR) { ... }
```

### Grammar Notes

- Grammar files use **Java syntax** for action blocks (compatible with IntelliJ plugin)
- `scripts/fix-lexer.js` post-processes the generated TypeScript
- String interpolation uses mode switching (STRING_MODE)
- The lexer tracks `interpolationDepth` for nested `${...}` expressions

## Implementation Notes

### TextMate Grammar Scopes

Map Kite tokens to standard TextMate scopes:

```json
{
  "keywords": "keyword.control.kite",
  "iac-keywords": "keyword.other.kite",
  "types": "support.type.kite",
  "strings": "string.quoted.double.kite",
  "numbers": "constant.numeric.kite",
  "comments": "comment.line.double-slash.kite",
  "functions": "entity.name.function.kite",
  "variables": "variable.other.kite",
  "decorators": "entity.name.decorator.kite"
}
```

### Declaration Detection Pattern

An identifier is a **declaration name** if followed by `=`, `{`, `+=`, or `:`.
Otherwise it's a **reference** to be resolved.

```typescript
function isDeclarationName(token: Token, nextToken: Token): boolean {
  return ['=', '{', '+=', ':'].includes(nextToken.text);
}
```

### Schema Property Detection

Inside schema/resource/component bodies, `type propertyName` pattern:
- First identifier = type
- Second identifier = property name (not a reference)

Handle array types: `string[] tags`
- Type token → ARRAY_LITERAL (`[]`) → property name

### Import Resolution Order

1. Relative to containing file
2. Project root
3. `.kite/providers/` (project-local)
4. `~/.kite/providers/` (user-global)
5. Package-style: `"aws.Database"` → `aws/Database.kite`

### Type Checking Exclusions

Skip "Cannot resolve symbol" warnings for:
- Decorator names (after `@`)
- Schema property definitions
- Type annotations (builtin types, PascalCase)
- Property access (after `.`)

### `any` Keyword

The `any` keyword is a **type keyword**, not an identifier. Handle it specially in type positions alongside `string`, `number`, `boolean`, etc.

### Schema Properties and @cloud Decorator

**Schema properties have two categories:**

- **Regular properties** - Required unless they have a default value (`= value`). Resource instances must provide all required properties or get an error.
- **@cloud properties** - Set by the cloud provider after resource creation (e.g., ARNs, IDs, endpoints). Never required in resource instances.

```kite
schema aws_instance {
    string name                      // Required - user must provide
    number port = 8080               // Optional - has default
    @cloud string arn                // Cloud-generated, not required
    @cloud(importable) string id     // Cloud-generated, importable for existing resources
}
```

**Component inputs** - ALL inputs are optional. When not specified at instantiation, users are prompted at CLI runtime to enter values. Never flag missing inputs as errors.

**Validation implications:**

| Declaration | Missing Required Check | Assignment Check | Unused Declaration Check |
|-------------|----------------------|------------------|-------------------------|
| Schema property (no default) | Error if missing in resource | Allowed | N/A (not a variable) |
| Schema property (with default) | No error (optional) | Allowed | N/A (not a variable) |
| Schema property with @cloud | Never an error (cloud-generated) | **Error** (cannot set) | N/A (not a variable) |
| Component input | Never an error (all optional) | Allowed | Never flagged (part of API) |
| Component output | N/A | N/A | Never flagged (exports values externally) |
| `var` declaration | N/A | Allowed | Warning if unused |
| Function parameter | N/A | Allowed | Warning if unused |
| Loop variable (`for x in`) | N/A | Allowed | Warning if unused |

**@cloud property behavior:**
- Not suggested in auto-completion (users can't set them)
- Error if user tries to set them: `Cannot set '@cloud' property 'x' - it is set by the cloud provider`

### Reserved Names

Keywords and built-in types cannot be used as property names in schemas or input/output names in components. Reserved words include:

- **Types:** `string`, `number`, `boolean`, `any`, `object`, `void`, `null`
- **Keywords:** `if`, `else`, `for`, `while`, `in`, `return`, `var`, `fun`, `schema`, `component`, `resource`, `input`, `output`, `type`, `import`, `from`, `init`, `this`, `true`, `false`

## Architecture Patterns

### Dependency Injection via Context

Handlers use dependency injection through context interfaces. All contexts extend `BaseContext`:

```typescript
// types.ts
export interface BaseContext {
    getDeclarations: (uri: string) => Declaration[] | undefined;
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}

// Handler-specific contexts extend BaseContext
export interface CompletionContext extends BaseContext {
    findEnclosingBlock: (text: string, offset: number) => BlockContext | null;
}
```

### Handler Pattern

Each LSP feature has a dedicated handler file:
- Receives document + position + context
- Returns LSP-compliant response
- No direct access to server state (injected via context)

### Parser Architecture

The extension uses a dual approach:
- **ANTLR parser** (`src/parser/`) - Full AST parsing for validation and semantic analysis
- **Scanner** (`scanner.ts`) - Lightweight regex-based scanning for quick declaration lookup

The ANTLR grammar files in `grammar/` are the source of truth. Regenerate after changes:
```bash
npm run generate-parser
```

## Quick Start - Running the Extension

### First Time Setup

```bash
cd /Users/mimedia/IdeaProjects/kite-vscode-plugin

# 1. Install dependencies
npm install

# 2. Compile TypeScript
npm run compile
```

### Run the Extension (Option A: From VS Code - Recommended)

1. Open the `kite-vscode-plugin` folder in VS Code
2. Press **F5** (or Run > Start Debugging)
3. A new VS Code window opens with the extension loaded
4. Open any `.kite` file from `examples/` folder
5. You should see syntax highlighting!

### Run the Extension (Option B: Watch Mode)

```bash
# Terminal 1: Watch for changes (auto-recompile)
npm run watch

# Then press F5 in VS Code to launch
```

### What to Test

Open `examples/simple.kite` or `examples/component.kite` in the test VS Code window:

- **Keywords** (`resource`, `component`, `schema`, `if`, `for`) - highlighted as keywords
- **Types** (`string`, `number`, `boolean`, `any`) - highlighted in blue
- **Strings** - highlighted in green (with interpolation `${var}`)
- **Comments** (`//` and `/* */`) - grey/italic
- **Decorators** (`@description`, `@tags`, `@count`, etc.) - highlighted
- **Numbers** - highlighted

### Package for Distribution

```bash
npm run package   # Creates kite-language-0.1.0.vsix
```

Install with: `code --install-extension kite-language-0.1.0.vsix`

## All Commands

```bash
npm install        # Install dependencies
npm run compile    # Compile TypeScript once
npm run watch      # Watch mode (auto-recompile)
npm run package    # Package extension as .vsix
npm test           # Run tests
npm run lint       # Lint TypeScript code
```

## Dependencies

```json
{
  "dependencies": {
    "vscode-languageclient": "^9.0.0",
    "vscode-languageserver": "^9.0.0",
    "vscode-languageserver-textdocument": "^1.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vsce": "^2.15.0"
  }
}
```

## Test Files

Key test scenarios in `examples/`:
- `simple.kite` - Basic syntax
- `common.kite` - Shared definitions
- Cross-file imports and references
- String interpolation (`${var}` and `$var`)
- Array types (`string[]`, `number[]`)
- Schema/resource type checking

## Reference Implementation

The IntelliJ plugin at `../kite-intellij-plugin` is the reference. Key mappings:

| IntelliJ Feature             | VS Code Handler                    |
|------------------------------|------------------------------------|
| `KiteCompletionContributor`  | `handlers/completion.ts`           |
| `KiteDocumentationProvider`  | `handlers/hover.ts`                |
| `KiteGotoDeclarationHandler` | `handlers/definition.ts`           |
| `KiteReferenceContributor`   | `handlers/references.ts`           |
| `KiteParameterInfoHandler`   | `handlers/signature-help.ts`       |
| `KiteInlayHintsProvider`     | `handlers/inlay-hints.ts`          |
| `KiteTypeCheckingAnnotator`  | `handlers/validation.ts`           |
| `KiteStructureViewElement`   | `handlers/document-symbols.ts`     |
- Always reffer to the grammar files *.g4 as those are the references for our programming language
- keep in mind, the grammar can change so don't modify generated files
- we reuse as much as possible code