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

### Import Completions:

#### Symbol Completions (after `import `):
When typing after `import `, suggests exportable symbols from the target file:
```kite
import █ from "common.kite"  // Shows: schemas, components, functions, types
```

| Symbol Type | Kind | Example |
|-------------|------|---------|
| Schema | Struct | `schema Config {}` |
| Component | Module | `component Server {}` |
| Function | Function | `fun calculate() {}` |
| Type alias | TypeParameter | `type Region = ...` |

#### Path Completions (inside quotes after `from`):
When typing inside the path string, suggests available `.kite` files:
```kite
import Config from "█"  // Shows: common.kite, utils.kite, etc.
```

- Shows relative paths from current file
- Excludes current file from suggestions
- Works for both named and wildcard imports

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

### Missing Value Validation:

**File:** `src/server/handlers/validation/missing-value.ts`

Reports error when an assignment has no value after `=`.

- Detects incomplete assignments in var, input, output, schema properties, resource properties
- Ignores comparison operators (`==`, `!=`, `<=`, `>=`)
- Ignores compound assignments (`+=`, `-=`, `*=`, `/=`)
- Ignores `=` in comments or strings

**Example:**
```kite
var x =              // Error: Missing value after '='
var y = 5            // OK

resource Config db {
    name =           // Error: Missing value after '='
    port = 3306      // OK
}
```

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
- **Organize Imports** (`Shift+Alt+O`): Comprehensive import cleanup
  - Merges imports from the same file into single import
  - Sorts imports alphabetically by path
  - Sorts symbols within imports alphabetically
  - Example: `import B from "x"` + `import A from "x"` → `import A, B from "x"`
  - **Also runs automatically on save** (via `willSaveWaitUntil`)
- **Add All Missing Imports**: Bulk import action (useful after paste)
  - Appears when multiple undefined symbols are detected
  - Adds all missing imports in one action
  - Groups symbols from same file into single import
  - Sorts symbols alphabetically

### Auto-Import on Paste

**File:** `src/server/handlers/auto-import/index.ts`

Automatically adds missing imports when pasting code containing undefined symbols.

- Detects paste operations (15+ characters inserted at once)
- Scans for undefined PascalCase symbols (schemas, components, types)
- Searches workspace for symbol definitions
- Automatically adds import statements after a short debounce (300ms)
- Shows notification: "Added N missing import(s)"

**Example:**
```kite
// Paste this code into a file:
resource DatabaseConfig db {
    host = "localhost"
}

// Auto-import adds at top of file:
import DatabaseConfig from "common.kite"
```

### Auto-Import on Type

**File:** `src/server/handlers/completion/auto-import-completions.ts`

Suggests importable symbols from other files in completions with automatic import insertion.

- Shows schemas, components, functions, and types from all workspace `.kite` files
- Completion items display `(auto-import from filename.kite)` in detail
- Selecting a completion automatically adds the import statement
- Lower priority than local symbols (appear after local suggestions)

**Example:**
```
// When typing "Data", completions show:
DatabaseConfig   schema (auto-import from common.kite)
DataProcessor    component (auto-import from processors.kite)

// Selecting "DatabaseConfig":
// 1. Inserts "DatabaseConfig" at cursor
// 2. Adds "import DatabaseConfig from "common.kite"" at top
```

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

## 17. Code Lens (Reference Counts)

**Handler:** `connection.onCodeLens`

Shows "X references" above declarations, making it easy to see how widely used each symbol is.

### Supported Declarations

| Declaration | Example | What's Counted |
|-------------|---------|----------------|
| Schema | `schema Config {}` | Resources using this schema |
| Component definition | `component Server {}` | Instances of this component |
| Component instance | `component Server api {}` | Property access on instance |
| Resource | `resource Config srv {}` | Property access on resource |
| Function | `fun calc() {}` | Function calls |
| Variable | `var x = 1` | Variable references |
| Type alias | `type Region = ...` | Type annotations |

### Features

- **Clickable**: Click "X references" to open References panel
- **Singular/plural**: Shows "1 reference" vs "2 references"
- **Cross-file counting**: Counts references from all workspace files
- **Comment filtering**: Ignores references inside comments
- **String filtering**: Ignores references in string literals (except interpolation)
- **Declaration excluded**: The definition itself isn't counted

### Example Display

```
2 references
schema ServerConfig {
    string host
    number port
}

3 references
fun calculateCost(number instances) number {
    return instances * 0.10
}

0 references
var unusedVariable = "test"
```

---

## 18. Workspace Symbols (Go to Symbol in Workspace)

**Handler:** `connection.onWorkspaceSymbol`

Provides global "Go to Symbol" (Cmd+T on Mac, Ctrl+T on Windows/Linux) to search across all workspace files.

### How to Use

1. Press **Cmd+T** (Mac) or **Ctrl+T** (Windows/Linux)
2. Type to search for symbols
3. Select a symbol to navigate to its definition

### Supported Symbols

| Symbol Type | Kind | Example |
|-------------|------|---------|
| Schema | Struct | `schema ServerConfig {}` |
| Component definition | Class | `component WebServer {}` |
| Component instance | Object | `component WebServer api {}` |
| Resource | Object | `resource Config srv {}` |
| Function | Function | `fun calculate() {}` |
| Variable | Variable | `var baseUrl = "..."` |
| Type alias | TypeParameter | `type Region = "..."` |

### Features

- **Case-insensitive search**: Type "config" to find "ServerConfig"
- **Substring matching**: Type "conn" to find "DatabaseConnection"
- **Cross-file search**: Searches all `.kite` files in workspace
- **File context**: Shows which file each symbol is from
- **Accurate positions**: Jump directly to the symbol's declaration

### Example

Searching for "server":

```
ServerConfig    (Struct)     config.kite
WebServer       (Class)      components.kite
webServer       (Object)     infra.kite
serverEndpoint  (Variable)   constants.kite
```

---

## 19. Semantic Tokens (Enhanced Syntax Highlighting)

**Handler:** `connection.onRequest('textDocument/semanticTokens/full')`

Provides enhanced syntax highlighting via the LSP semantic tokens protocol, enabling the editor to distinguish between different uses of identifiers.

### Token Types

| Token Type | Description | Examples |
|------------|-------------|----------|
| `class` | Schema and component definitions | `schema Config {}`, `component Server {}` |
| `variable` | Variable declarations and references | `var x = 1`, `resource Type name {}` |
| `function` | Function definitions and calls | `fun calc() {}`, `calc()` |
| `parameter` | Function parameters and inputs | `fun f(number x)`, `input string name` |
| `property` | Schema properties and outputs | `string host`, `output string endpoint` |
| `type` | Type annotations and aliases | `string`, `number`, `type Region = ...` |
| `decorator` | Decorator names | `@description`, `@tags` |
| `keyword` | Control flow keywords | `if`, `else`, `for`, `while`, `return`, `in` |

### Token Modifiers

| Modifier | Description | Applied To |
|----------|-------------|------------|
| `declaration` | New symbol binding | Variable, parameter, property declarations |
| `definition` | Symbol definition | Schema, component, function, type definitions |

### Supported Constructs

- **Schema definitions**: Name highlighted as class with definition modifier
- **Schema properties**: Type and property name with declaration modifier
- **Component definitions**: Name as class/definition, instance name as variable/declaration
- **Component instances**: Type reference and instance name
- **Resources**: Type reference and instance name
- **Functions**: Name with definition modifier, parameters, return type
- **Variables**: Declarations with modifier, references without
- **Type aliases**: Name with definition modifier
- **Decorators**: Name after `@`
- **Keywords**: `if`, `else`, `for`, `while`, `in`, `return`
- **References**: Variable and function references in expressions

### Example

```kite
schema Config {        // Config: class/definition
    string host        // string: type, host: property/declaration
}

resource Config srv {  // Config: class, srv: variable/declaration
    host = myVar       // myVar: variable (reference)
}

fun calc(number x) {   // calc: function/definition, x: parameter/declaration
    return x * 2       // return: keyword, x: variable
}
```

### Features

- **Declaration vs Reference**: Distinguishes between defining a symbol and using it
- **Function call detection**: Identifies function calls by following `(`
- **String filtering**: Ignores identifiers inside string literals
- **Comment filtering**: Skips content in comments
- **Keyword exclusion**: Reserved words not highlighted as variables

---

## 20. Folding Range (Code Folding)

**Handler:** `connection.onFoldingRanges`

Provides custom code folding regions, allowing users to collapse and expand code blocks.

### Supported Constructs

| Construct | Example | Fold Kind |
|-----------|---------|-----------|
| Schema | `schema Config { ... }` | Region |
| Component definition | `component Server { ... }` | Region |
| Component instance | `component Server api { ... }` | Region |
| Resource | `resource Config srv { ... }` | Region |
| Function | `fun calc() { ... }` | Region |
| If block | `if condition { ... }` | Region |
| Else block | `} else { ... }` | Region |
| For loop | `for item in items { ... }` | Region |
| While loop | `while running { ... }` | Region |
| Object literal | `var x = { ... }` | Region |
| Array literal | `var x = [ ... ]` | Region |
| Import group | Multiple consecutive imports | Imports |
| Multi-line comment | `/* ... */` | Comment |

### Features

- **Nested folding**: Inner blocks can be folded independently of outer blocks
- **Import groups**: Consecutive import statements fold together (requires 2+ imports)
- **Comment folding**: Multi-line `/* */` comments are foldable
- **String awareness**: Braces inside strings don't create fold regions
- **Single-line exclusion**: Blocks on a single line don't create fold regions

### Example

```kite
import Config from "config.kite"  ─┐
import Server from "server.kite"  ─┘ Imports fold

/*                               ─┐
 * Multi-line                     │ Comment fold
 * comment                       ─┘
 */

schema ServerConfig {            ─┐
    string host                   │
    number port                   │ Region fold
}                                ─┘

component WebServer {            ─┐
    fun init() {                 ─┼─┐
        var x = 1                 │ │ Nested fold
    }                            ─┼─┘
}                                ─┘
```

### Usage

- **Fold**: Click the `-` icon in the gutter, or use `Cmd+Opt+[` (Mac) / `Ctrl+Shift+[` (Windows/Linux)
- **Unfold**: Click the `+` icon, or use `Cmd+Opt+]` / `Ctrl+Shift+]`
- **Fold All**: `Cmd+K Cmd+0` / `Ctrl+K Ctrl+0`
- **Unfold All**: `Cmd+K Cmd+J` / `Ctrl+K Ctrl+J`

---

## 21. Call Hierarchy

**Handlers:** `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, `callHierarchy/outgoingCalls`

Shows incoming and outgoing function calls, enabling navigation through call relationships.

### How to Use

1. Place cursor on a function name (definition or call)
2. Right-click and select **"Show Call Hierarchy"** or use `Shift+Alt+H`
3. View incoming calls (who calls this function) or outgoing calls (what this function calls)

### Features

| Feature | Description |
|---------|-------------|
| **Prepare** | Identifies function at cursor position |
| **Incoming Calls** | Shows all places that call the selected function |
| **Outgoing Calls** | Shows all functions called from the selected function |
| **Cross-file** | Works across all `.kite` files in workspace |
| **Recursive** | Shows recursive calls (function calling itself) |
| **Nested Calls** | Handles `b(a())` correctly, showing both `a` and `b` |

### Example

```kite
fun helper() {           // <- 2 incoming calls (from processA, processB)
    return 42
}

fun processA() {
    helper()             // <- Outgoing: calls helper
}

fun processB() {
    var x = helper()     // <- Outgoing: calls helper
    processA()           // <- Outgoing: calls processA
}
```

From `helper`:
- **Incoming**: `processA`, `processB`
- **Outgoing**: (none)

From `processB`:
- **Incoming**: (none)
- **Outgoing**: `helper`, `processA`

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Show Call Hierarchy | `Shift+Alt+H` | `Shift+Alt+H` |
| Peek Call Hierarchy | `Shift+Cmd+Alt+H` | `Shift+Ctrl+Alt+H` |

---

## 22. Linked Editing Range

**Handler:** `textDocument/linkedEditingRange`

Enables simultaneous editing of related identifiers. When you edit one occurrence, all linked occurrences update in real-time as you type.

### Supported Scopes

| Scope | Description |
|-------|-------------|
| **Loop variables** | `for item in items { ... item ... }` |
| **Function parameters** | `fun calc(x) { return x * 2 }` |

### How to Use

1. Enable linked editing in VS Code settings:
   - **Settings → Editor → Linked Editing** = `true`
   - Or add `"editor.linkedEditing": true` to settings.json

2. Place cursor on a loop variable or function parameter
3. Start typing - all related occurrences update simultaneously

### Example: Loop Variable

```kite
for item in items {    // <- Edit "item" here
    process(item)      // <- This updates automatically
    log(item)          // <- This updates automatically
}
```

### Example: Function Parameter

```kite
fun calculate(x) {     // <- Edit "x" here
    var y = x * 2      // <- This updates automatically
    return x + y       // <- This updates automatically
}
```

### Scope Boundaries

Linked editing respects scope boundaries:
- Loop variables only link within their loop body
- Function parameters only link within their function body
- Variables outside the scope are NOT linked (use Rename F2 for broader changes)

### Difference from Rename (F2)

| Feature | Linked Editing | Rename (F2) |
|---------|---------------|-------------|
| Trigger | Automatic while typing | Manual |
| Scope | Single block (loop/function) | Entire file/workspace |
| UI | No dialog, instant | Shows preview |
| Use case | Quick local edits | Broader refactoring |

---

## 23. Document Links

**Handler:** `textDocument/documentLink`

Makes import paths clickable. Ctrl+Click (or Cmd+Click on Mac) on an import path to open the referenced file.

### How to Use

1. Hover over an import path (between quotes)
2. Hold `Ctrl` (Windows/Linux) or `Cmd` (Mac)
3. The path becomes a clickable link
4. Click to open the referenced file

### Supported Import Styles

| Style | Example | Resolved Path |
|-------|---------|---------------|
| **Simple filename** | `"common.kite"` | `./common.kite` |
| **Relative path** | `"./utils.kite"` | `./utils.kite` |
| **Parent path** | `"../common.kite"` | `../common.kite` |
| **Package-style** | `"aws.Database"` | `./aws/Database.kite` |

### Example

```kite
import * from "common.kite"        // <- Ctrl+Click to open common.kite
import Config from "database.kite" // <- Ctrl+Click to open database.kite
import * from "aws.Lambda"         // <- Ctrl+Click to open aws/Lambda.kite
```

### Features

| Feature | Description |
|---------|-------------|
| **Clickable paths** | Import paths become links when hovering with Ctrl/Cmd |
| **Tooltip** | Shows "Open {filename}" tooltip on hover |
| **All import styles** | Works with wildcard and named imports |
| **Package-style paths** | Converts `aws.Lambda` to `aws/Lambda.kite` |

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Follow link | `Cmd+Click` | `Ctrl+Click` |
| Open link in new editor | `Cmd+Alt+Click` | `Ctrl+Alt+Click` |

---

## 24. On Type Formatting

**Handler:** `textDocument/onTypeFormatting`

Auto-formats code as you type. Triggered when pressing Enter or typing `}`.

### Trigger Characters

| Character | Action |
|-----------|--------|
| `Enter` | Auto-indent new line based on context |
| `}` | Adjust closing brace indentation |

### How It Works

**After `{` + Enter:**
```kite
schema Config {|    // <- Press Enter here
    |               // <- Cursor moves to indented position
}
```

**Closing brace:**
```kite
schema Config {
    string name
    }|              // <- Type } here, gets reformatted to:
}|                  // <- Proper indent level
```

### Features

| Feature | Description |
|---------|-------------|
| **Smart indent after `{`** | Adds one indent level after opening brace |
| **Maintain indent** | Keeps same indent for consecutive lines in block |
| **Fix `}` indent** | Reduces indent for closing brace |
| **Nested blocks** | Handles multiple nesting levels correctly |
| **Custom tab size** | Respects `tabSize` and `insertSpaces` settings |
| **String awareness** | Ignores `{` inside string literals |

### Configuration

Set your preferred indentation in VS Code settings:

```json
{
    "editor.tabSize": 4,
    "editor.insertSpaces": true
}
```

### Example Workflow

1. Type `schema Config {` and press Enter
2. Cursor auto-indents by one level (4 spaces default)
3. Type `string name` and press Enter
4. Cursor maintains same indent
5. Type `}` and it auto-corrects to column 0

---

## 25. Unused Variables Detection

**Diagnostic Type:** Warning with `DiagnosticTag.Unnecessary` (shows as faded text)

Detects declared variables that are never used and highlights them with a warning.

### Detected Declarations

| Declaration Type | Severity | Example |
|-----------------|----------|---------|
| `var` | Warning | `var x = 10` |
| `input` | Warning | `input string name = "default"` |
| `output` | Hint | `output string endpoint = "..."` |
| Loop variable | Warning | `for item in items { ... }` |
| Function parameter | Warning | `fun calc(number x) { ... }` |

### How It Works

```kite
var x = 10          // Warning: Variable 'x' is declared but never used
var y = 20
var result = y * 2  // y is used, no warning

for item in items { // Warning: Loop variable 'item' is declared but never used
    println("hello")
}

fun process(number n) {  // Warning: Parameter 'n' is declared but never used
    return 42
}
```

### Features

| Feature | Description |
|---------|-------------|
| **Scope-aware** | Only checks usage within the variable's scope |
| **String interpolation** | Recognizes `${var}` as a valid use |
| **Faded text** | Uses `DiagnosticTag.Unnecessary` for visual distinction |
| **Output leniency** | Outputs use Hint severity (consumed externally) |

### Why Different Severities?

- **Outputs** use **Hint** severity because they're meant to be consumed by the code that instantiates the component
- **Variables, inputs, parameters** use **Warning** severity because they're likely mistakes

---

## 26. Go to Type Definition

**Handler:** `textDocument/typeDefinition`

Navigate from a variable, resource instance, or component instance to its type definition (schema or component).

### How to Use

1. Place cursor on a variable, resource instance, or component instance
2. Right-click and select **"Go to Type Definition"** (or `Cmd+Click` while holding `Alt` on Mac)
3. Jump to the schema or component definition

### Supported Scenarios

| Context | Example | Navigates To |
|---------|---------|-------------|
| Resource instance | `resource ServerConfig web { ... }` | `schema ServerConfig { ... }` |
| Component instance | `component WebServer api { ... }` | `component WebServer { ... }` |
| Typed variable | `var User currentUser = ...` | `schema User { ... }` |
| Typed input | `input DatabaseConfig db = ...` | `schema DatabaseConfig { ... }` |

### Example

```kite
schema Config {
    string host
    number port
}

resource Config server {    // <- Go to Type Definition on "server"
    host = "localhost"      //    navigates to schema Config above
    port = 8080
}
```

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Go to Type Definition | `Alt+Cmd+Click` | `Alt+Ctrl+Click` |
| Peek Type Definition | `Alt+F12` | `Alt+F12` |

### Built-in Types

Built-in types (`string`, `number`, `boolean`, `any`, `object`) have no type definition to navigate to, so the feature returns nothing for these.

---

## All Features Complete

All planned language server features have been implemented for the Kite VS Code extension.
