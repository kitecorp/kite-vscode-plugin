# Kite VS Code Extension - Development Guide

## Overview

This is the VS Code extension for the Kite language. It should mirror the features of the IntelliJ plugin located at `../kite-intellij-plugin`.

## Reference Implementation

The IntelliJ plugin at `../kite-intellij-plugin` is the reference implementation. Use it to understand:
- Language syntax and semantics
- Feature behavior expectations
- Test files in `../kite-intellij-plugin/examples/`

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
@cloud(["aws", "gcp"])
@tags({Environment: "production"})
resource VM.Instance server { }

// String interpolation
var greeting = "Hello, ${name}!"
var simple = "Value: $value"

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

## Features to Implement

### Completed: Basic Language Support
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Syntax Highlighting | `KiteSyntaxHighlighter.java` | TextMate grammar | ✅ |
| Bracket Matching | Built-in | `language-configuration.json` | ✅ |
| Comment Toggling | Built-in | `language-configuration.json` | ✅ |
| Code Folding | Built-in | TextMate regions | ✅ |

### Completed: Semantic Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Go to Definition | `KiteGotoDeclarationHandler.java` | `textDocument/definition` | ✅ |
| Find References | `KiteReferenceContributor.java` | `textDocument/references` | ✅ |
| Autocomplete | `KiteCompletionContributor.java` | `textDocument/completion` | ✅ |
| Hover/Quick Docs | `KiteDocumentationProvider.java` | `textDocument/hover` | ✅ |
| Parameter Hints | `KiteParameterInfoHandler.java` | `textDocument/signatureHelp` | ✅ |
| Cross-file Navigation | `KiteGotoDeclarationHandler.java` | `textDocument/definition` | ✅ |
| Property Navigation | - | `textDocument/definition` | ✅ |

### Completed: Diagnostics & Validation
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Import Validation | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Decorator Validation | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Duplicate Name Detection | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ✅ |
| Quick Fix: Add Import | - | `textDocument/codeAction` | ✅ |

### Completed: Smart Autocomplete
| Feature | Description | Status |
|---------|-------------|--------|
| Scope-aware Variables | Only shows variables in current scope | ✅ |
| Priority Ordering | inputs → variables → resources → components → outputs → functions | ✅ |
| Schema Property Completion | Inside resource bodies | ✅ |
| Component Input Completion | Inside component instances | ✅ |
| DevOps-aware Defaults | Ports, regions, CIDRs, instance types, etc. | ✅ |
| Context-aware in Schemas | Type-appropriate suggestions for defaults | ✅ |
| Context-aware in Components | Type-appropriate suggestions for input/output defaults | ✅ |

### Completed: Navigation & Structure
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Document Symbols | `KiteStructureViewElement.java` | `textDocument/documentSymbol` | ✅ |
| Inlay Hints | `KiteInlayHintsProvider.java` | `textDocument/inlayHint` | ✅ |

### Completed: Refactoring
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Rename Symbol | - | `textDocument/rename` | ✅ |

### Priority 1: Remaining Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Code Formatting | `KiteBlock.java` | `textDocument/formatting` | ⬜ |
| Type Checking | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ⬜ |

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

### Scanner vs ANTLR

Currently using regex-based parsing in `scanner.ts`. ANTLR grammar files exist in `/grammar/` but are not integrated. Benefits of ANTLR:
- More robust parsing
- Better error recovery
- Matches IntelliJ implementation

To integrate ANTLR (future work):
```bash
npm install antlr4ts
npx antlr4ts -visitor grammar/KiteLexer.g4 grammar/KiteParser.g4
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
- **Decorators** (`@cloud`) - highlighted
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