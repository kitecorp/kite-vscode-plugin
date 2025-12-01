# Kite VS Code Extension - Features Documentation

This document describes all implemented features in the Kite Language VS Code extension.

---

## 1. Syntax Highlighting

**File:** `syntaxes/kite.tmLanguage.json`

TextMate grammar-based syntax highlighting for:
- Keywords: `resource`, `component`, `schema`, `input`, `output`, `var`, `fun`, `if`, `else`, `for`, `while`, `return`
- Types: `string`, `number`, `boolean`, `any`, `object`, `void`
- Strings: Double-quoted with interpolation (`${var}`, `$var`), single-quoted (literal)
- Numbers: Integers and decimals
- Comments: Single-line (`//`) and multi-line (`/* */`)
- Decorators: `@name` and `@name(args)`
- Operators: Arithmetic, comparison, logical, assignment

---

## 2. Go to Definition

**Handler:** `connection.onDefinition`

Navigate to the definition of symbols with Ctrl+Click or F12.

### Supported:
- **Variables** - Jump to `var` declaration
- **Functions** - Jump to `fun` definition
- **Schemas** - Jump to `schema` definition
- **Components** - Jump to `component` definition
- **Resources** - Jump to `resource` declaration
- **Imports** - Cross-file navigation for imported symbols
- **Property navigation** - Ctrl+click on property name in resource body jumps to schema property
- **Import paths** - Ctrl+click on `"common.kite"` opens that file directly

### Cross-file Resolution:
1. First checks current file
2. Then searches other `.kite` files in workspace
3. Only navigates to imported symbols (shows error if not imported)

---

## 3. Find References

**Handler:** `connection.onReferences`

Find all usages of a symbol with Shift+F12.

### Supported:
- Variables
- Functions
- Schemas
- Components
- Cross-file references

---

## 4. Autocomplete

**Handler:** `connection.onCompletion`

Intelligent autocomplete with context awareness.

### Priority Order (in value context):
1. Inputs
2. Variables
3. Resources
4. Components
5. Outputs
6. Functions

### Context-Aware Completions:

#### Inside Schema Body (before `=`):
- Types: `string`, `number`, `boolean`, `any`, `object`, `void`
- Array types: `string[]`, `number[]`, etc.
- Other schema names

#### Inside Schema Body (after `=`):
- **boolean**: `true`, `false`
- **number** (by property name):
  - `port`: 80, 443, 22, 3000, 3306, 5432, 6379, 8080, 27017
  - `timeout`: 30, 60, 300, 900, 3600
  - `memory`: 128, 256, 512, 1024, 2048
  - `replicas`: 1, 2, 3, 5
  - `ttl`: 60, 300, 3600, 86400
- **string** (by property name):
  - `environment`/`env`: "dev", "staging", "prod"
  - `region`: "us-east-1", "us-west-2", "eu-west-1"
  - `host`: "localhost", "0.0.0.0"
  - `cidr`: "10.0.0.0/16", "10.0.1.0/24"
  - `instanceType`: "t2.micro", "t3.small"
  - `runtime`: "nodejs18.x", "python3.11"
  - `provider`: "aws", "gcp", "azure"
  - And many more...

#### Inside Resource/Component Body:
- Schema properties / Component inputs (excluding already set)
- After `=`: Same DevOps-aware suggestions as schemas

#### Inside Component Definition:
- Keywords: `input`, `output`, `var`, `resource`, `component`
- Types for input/output declarations
- Default value suggestions (same as schemas)

### Scope Filtering:
- Variables inside functions only visible within that function
- Function parameters scoped to function body
- File-level variables visible everywhere

### Dot Completion (`object.`):
- For resources: Shows set properties (with indicator) + unset schema properties
- For component instances: Shows outputs

---

## 5. Hover Documentation

**Handler:** `connection.onHover`

Shows documentation on hover.

### Information Shown:
- **Variables**: Type and value
- **Functions**: Signature with parameters and return type
- **Schemas**: Property list with types
- **Components**: Inputs and outputs
- **Decorators**: Description and expected arguments

---

## 6. Signature Help

**Handler:** `connection.onSignatureHelp`

Parameter hints when calling functions.

**Trigger:** `(` and `,`

Shows:
- Function name
- Parameter list with types
- Active parameter highlighting

---

## 7. Document Symbols (Outline)

**Handler:** `connection.onDocumentSymbol`

Provides the outline view in VS Code's sidebar.

### Symbol Types:
| Kite Construct | Symbol Kind | Icon |
|----------------|-------------|------|
| `schema` | Struct | S |
| `component` (definition) | Class | C |
| `resource` | Object | {} |
| `component` (instance) | Object | {} |
| `fun` | Function | f |
| `type` | TypeParameter | T |
| `var` | Variable | V |
| `input` | Property | P |
| `output` | Event | E |

### Hierarchy:
- Schemas show properties as children
- Component definitions show inputs/outputs as children

---

## 8. Diagnostics & Validation

**Handler:** `validateDocument` + `connection.onCodeAction`

### Import Validation:
- **Error**: Using schema/component/function from non-imported file
- **Quick Fix**: "Import 'X' from 'file.kite'"
- Smart import: Adds to existing import from same file

### Decorator Validation:
- Type checking for decorator arguments
- Expected types: `none`, `string`, `number`, `array`, `object`, `reference`

### Duplicate Name Detection:
- Errors for duplicate names within component definitions
- Checks: inputs, outputs, variables, resources, nested components

---

## 9. Code Actions (Quick Fixes)

**Handler:** `connection.onCodeAction`

### Available Quick Fixes:
- **Add Import**: When using symbol from non-imported file
  - Creates new import: `import SymbolName from "file.kite"`
  - Or adds to existing: `import Existing, SymbolName from "file.kite"`
- **Remove Unused Import**: Removes single unused import
- **Remove All Unused Imports**: Removes all unused imports at once
- **Convert to Named Import**: Converts `import * from "file"` to `import UsedA, UsedB from "file"`
  - Analyzes which symbols are actually used
  - Only includes symbols that are referenced in the file
  - Alphabetically sorted symbol list

---

## 10. Inlay Hints

**Handler:** `connection.onRequest('textDocument/inlayHint')`

Shows inline type and parameter hints.

### Type Hints for Variables
When `var` is declared without explicit type, shows inferred type:
```kite
var x = 5           // x: number
var name = "hello"  // name: string
var flag = true     // flag: boolean
var items = [1, 2]  // items: array
var config = {}     // config: object
```

### Parameter Hints at Call Sites
Shows parameter names before arguments in function calls:
```kite
calculateCost(5, "production")
// Shows: calculateCost(instances: 5, tier: "production")
```

**Skipped when:**
- Argument is already a named argument (`name: value`)
- Argument variable name matches parameter name
- Calling keywords (`if`, `while`, `for`, etc.)

### Property Type Hints in Resource Bodies
Shows property types from schema definition:
```kite
resource ServerConfig webServer {
  host = "localhost"  // host: string
  port = 8080         // port: number
  ssl = true          // ssl: boolean
}
```

### Property Type Hints in Component Instances
Shows input types from component definition:
```kite
component WebServer api {
  name = "payments"   // name: string
  replicas = 3        // replicas: number
}
```

### Type Inference
The `inferTypeFromValue` helper detects:
| Value | Inferred Type |
|-------|---------------|
| `"..."` or `'...'` | `string` |
| `123`, `-45`, `3.14` | `number` |
| `true`, `false` | `boolean` |
| `null` | `null` |
| `[...]` | `array` |
| `{...}` | `object` |

### VS Code Settings
Enable inlay hints: **Settings → Editor → Inlay Hints → Enabled**

---

## 11. Rename Symbol

**Handler:** `connection.onRenameRequest` + `connection.onPrepareRename`

Rename symbols across the entire file with F2.

### Supported:
- Variables
- Functions
- Schemas
- Components
- Resources
- Inputs/Outputs
- Loop variables (`for item in items`)

### Features:
- **Prepare rename** - Validates the symbol can be renamed before showing dialog
- **Scope-aware** - Only renames within appropriate scope (e.g., loop variables only within loop)
- **Cross-file rename** - Renames symbol in all files where it's used
- **Conflict detection** - Warns if new name conflicts with existing symbol

---

## 12. Code Formatting

**Handler:** `connection.onDocumentFormatting`

Auto-format Kite files with consistent indentation.

### Formatting Rules:
- **Indentation**: 4 spaces per level
- **Braces**: Opening brace on same line, closing brace on own line
- **Spacing**: Consistent spacing around operators and after keywords
- **Blank lines**: Preserved between top-level declarations
- **Comments**: Preserved in place

### Supported Constructs:
- Schemas, components, resources
- Functions with parameters
- Control flow (`if`, `else`, `for`, `while`)
- Object literals and arrays
- Decorators

---

## 13. Type Checking

**Handler:** `validateDocument` (part of diagnostics)

Validates type consistency throughout the code.

### Checks:
- **Schema property types** - Verifies values match declared types
- **Function parameter types** - Checks argument types in function calls
- **Return type consistency** - Validates function return statements
- **Assignment compatibility** - Checks variable assignments match declared types

### Error Messages:
- "Type 'X' is not assignable to type 'Y'"
- "Expected N arguments but got M"
- "Property 'X' does not exist on type 'Y'"

---

## 14. Unused Import Detection

**Handler:** `validateDocument` + `connection.onCodeAction`

Detects and helps remove unused imports.

### Features:
- **Warning diagnostic** - Shows warning for unused imports
- **Quick fix: Remove import** - Removes single unused import
- **Quick fix: Remove all unused** - Removes all unused imports at once
- **Smart removal** - For multi-symbol imports, only removes unused symbol

### Detection:
- Tracks all symbols from import statements
- Scans file for symbol usage (including string interpolation)
- Reports imports where no symbols are used

---

## Configuration Files

### `language-configuration.json`
- Bracket matching: `()`, `[]`, `{}`
- Auto-closing pairs
- Comment toggling: `//`, `/* */`
- Folding regions
- Word pattern for identifiers

### `package.json`
- Language registration (`.kite` files)
- Grammar contribution
- Extension activation events

---

## Implementation Notes

### Declaration Cache
- `declarationCache: Map<string, Declaration[]>`
- Updated on document change
- Stores all declarations per file

### Cross-file Resolution
- `findKiteFilesInWorkspace()` - Finds all `.kite` files
- `getFileContent()` - Reads file content with caching
- `isSymbolImported()` - Checks if symbol is imported
- `extractImports()` - Parses import statements

### Block Detection
- `findEnclosingBlock()` - Finds resource/component containing cursor
- `isInsideSchemaBody()` - Checks if inside schema definition
- `isInsideComponentDefinition()` - Checks if inside component definition
- `isAfterEquals()` - Checks if in value context

### Utility Functions (consolidated 2024-12-01)
- `escapeRegex()` - Escape special regex characters (text-utils.ts)
- `wordBoundaryRegex()` - Create word boundary regex (text-utils.ts)
- `isInComment()` - Check if position is inside comment (text-utils.ts)
- `findBraceEnd()` - Find matching closing brace (text-utils.ts)
- `resolveImportPath()` - Resolve import to file path (import-utils.ts)
- `findSymbolInWorkspace()` - Search symbol across files (workspace-utils.ts)

---

## 15. Document Highlight

**Handler:** `connection.onDocumentHighlight`

Highlights all occurrences of the symbol under the cursor.

### Features:
- **Word boundary matching** - Only matches complete words, not partial matches
- **Write vs Read detection** - Declarations and assignments shown differently from reads
- **Comment filtering** - Ignores occurrences inside comments
- **String filtering** - Ignores occurrences inside single-quoted strings (non-interpolated)
- **Interpolation support** - Highlights variables inside `${var}` and `$var` in double-quoted strings

### Write Detection (shown with different highlight):
- Variable declarations (`var x = ...`)
- Function declarations (`fun name(...)`)
- Schema/component definitions (`schema Name`, `component Name`)
- Input/output declarations
- Loop variables (`for item in items`)
- Assignment targets (`x = ...`, `x += ...`)

### Read Detection:
- Variable references in expressions
- Function calls
- Type references (`resource TypeName instance`)
- Property access

---

## 16. Selection Range (Smart Expand Selection)

**Handler:** `connection.onSelectionRanges`

Provides smart expand/shrink selection using Cmd+Shift+→ (Mac) or Ctrl+Shift+→ (Windows/Linux).

### Hierarchy

Selection expands through these levels (from smallest to largest):

1. **Word/Identifier** - The token under cursor
2. **String Interpolation** - `${expression}` inside strings
3. **String Literal** - Full quoted string
4. **Expression** - Property access chains (`a.b.c`), function calls
5. **Parentheses Content** - Inside `(...)` (function parameters, conditions)
6. **Full Parentheses** - Including `(` and `)`
7. **Statement** - Single line statement
8. **Block Content** - Inside `{...}`
9. **Full Block** - Including `{` and `}`
10. **Declaration** - Schema, component, function, resource
11. **Whole Document**

### Supported Constructs

- **Variables**: `var name = value`
- **Schemas**: `schema Name { properties }`
- **Components**: `component Name { inputs/outputs }`
- **Resources**: `resource Type name { properties }`
- **Functions**: `fun name(params) { body }`
- **Control Flow**: `if`, `for`, `while` blocks
- **Imports**: `import symbols from "path"`
- **Decorators**: `@name(args)`
- **Nested Structures**: Objects, arrays, nested blocks

### Example

```kite
schema Config {
    string host = "localhost"
}
```

With cursor in `localhost`:
1. → `localhost` (word)
2. → `"localhost"` (string)
3. → `string host = "localhost"` (statement)
4. → `string host = "localhost"` (block content)
5. → `schema Config { ... }` (declaration)
6. → entire file

---

## Future Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Workspace Symbols | Global "Go to Symbol" (Cmd+T) across all files | Medium |
| Semantic Tokens | Enhanced syntax highlighting via LSP | Medium |
| Code Lens | Show "X references" above declarations | Low |
| Folding Range | Custom folding regions via LSP | Low |
