# Kite VS Code Extension - Development Guide

## Overview

This is the VS Code extension for the Kite language. It should mirror the features of the IntelliJ plugin located at `../kite-intellij-plugin`.

## Reference Implementation

The IntelliJ plugin at `../kite-intellij-plugin` is the reference implementation. Use it to understand:
- Language syntax and semantics
- Feature behavior expectations
- Test files in `../kite-intellij-plugin/examples/`

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

### Priority 1: Basic Language Support
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Syntax Highlighting | `KiteSyntaxHighlighter.java` | TextMate grammar | ⬜ |
| Bracket Matching | Built-in | `language-configuration.json` | ⬜ |
| Comment Toggling | Built-in | `language-configuration.json` | ⬜ |
| Code Folding | Built-in | TextMate regions | ⬜ |

### Priority 2: Semantic Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Go to Definition | `KiteGotoDeclarationHandler.java` | `textDocument/definition` | ⬜ |
| Find References | `KiteReferenceContributor.java` | `textDocument/references` | ⬜ |
| Autocomplete | `KiteCompletionContributor.java` | `textDocument/completion` | ⬜ |
| Hover/Quick Docs | `KiteDocumentationProvider.java` | `textDocument/hover` | ⬜ |

### Priority 3: Advanced Features
| Feature | IntelliJ File | LSP Method | Status |
|---------|--------------|------------|--------|
| Diagnostics/Errors | `KiteTypeCheckingAnnotator.java` | `textDocument/publishDiagnostics` | ⬜ |
| Parameter Hints | `KiteParameterInfoHandler.java` | `textDocument/signatureHelp` | ⬜ |
| Inlay Hints | `KiteInlayHintsProvider.java` | `textDocument/inlayHint` | ⬜ |
| Code Formatting | `KiteBlock.java` | `textDocument/formatting` | ⬜ |
| Document Symbols | `KiteStructureViewElement.java` | `textDocument/documentSymbol` | ⬜ |

## Project Structure

```
kite-vscode-plugin/
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript config
├── src/
│   ├── extension.ts            # Extension entry point
│   ├── client/
│   │   └── client.ts           # Language client
│   └── server/
│       ├── server.ts           # Language server main
│       ├── parser/             # Parser (ANTLR or custom)
│       ├── analyzer/           # Semantic analysis
│       └── providers/          # LSP providers
├── syntaxes/
│   └── kite.tmLanguage.json    # TextMate grammar
├── language-configuration.json  # Brackets, comments
└── examples/                   # Test files (copy from IntelliJ)
```

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

## ANTLR Option

To reuse the ANTLR grammar from IntelliJ:

```bash
# Install ANTLR TypeScript target
npm install antlr4ts antlr4ts-cli

# Generate parser (copy .g4 files first)
npx antlr4ts -visitor -no-listener KiteLexer.g4 KiteParser.g4
```

Grammar files location: `../kite-intellij-plugin/src/main/antlr/cloud/kitelang/intellij/parser/`

## Test Files

Copy example files from IntelliJ plugin:
```bash
cp -r ../kite-intellij-plugin/examples ./examples
```

Key test scenarios:
- `examples/simple.kite` - Basic syntax
- `examples/common.kite` - Shared definitions
- Cross-file imports and references
- String interpolation (`${var}` and `$var`)
- Array types (`string[]`, `number[]`)
- Schema/resource type checking

## Project Structure
kite-vscode-plugin/
├── CLAUDE.md                    # Comprehensive development guide
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript configuration
├── language-configuration.json  # Brackets, comments, folding
├── .gitignore                  # Git ignore rules
├── .vscodeignore               # VS Code packaging ignore
├── src/
│   └── extension.ts            # Extension entry point
├── syntaxes/
│   └── kite.tmLanguage.json    # TextMate grammar for syntax highlighting
└── examples/                   # Test files (copied from IntelliJ)