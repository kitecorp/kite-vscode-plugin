# Core IDE Features

This document covers the core IDE features of the Kite Language VS Code extension.

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

### Code Snippets

**File:** `src/server/handlers/completion/snippets.ts`

Pre-built code templates for common Kite patterns. Snippets appear as completions and expand with tab stops for easy editing.

#### Top-Level Snippets

| Prefix | Description | Expands To |
|--------|-------------|------------|
| `schema` | Schema definition | `schema Name { string property }` |
| `schemad` | Schema with defaults | `schema Name { string name = "default" ... }` |
| `component` | Component definition | `component Name { input string name; output string result }` |
| `compinst` | Component instance | `component Type instanceName { property = value }` |
| `resource` | Resource declaration | `resource SchemaType name { property = value }` |
| `resourcet` | Resource with tags | `@tags({ Environment: "prod" }) resource ...` |
| `fun` | Function with return | `fun name(type param) returnType { return result }` |
| `funv` | Void function | `fun name(type param) { ... }` |
| `import` | Wildcard import | `import * from "filename.kite"` |
| `importn` | Named import | `import Symbol from "filename.kite"` |
| `type` | Type alias | `type Name = "option1" \| "option2"` |

#### Control Flow Snippets (Any Context)

| Prefix | Description | Expands To |
|--------|-------------|------------|
| `if` | If statement | `if (condition) { ... }` |
| `ife` | If-else statement | `if (condition) { ... } else { ... }` |
| `for` | For loop | `for (item in items) { ... }` |
| `while` | While loop | `while (condition) { ... }` |
| `var` | Variable (inferred type) | `var name = value` |
| `vart` | Variable (explicit type) | `var type name = value` |

#### Component Body Snippets

| Prefix | Description | Expands To |
|--------|-------------|------------|
| `input` | Input declaration | `input string name = default` |
| `output` | Output declaration | `output string name = value` |

#### Using Snippets

1. Type the prefix (e.g., `schema`)
2. Select the snippet from completions
3. Press Tab to move between placeholders
4. Edit each placeholder as needed

Snippets use VS Code's snippet syntax with numbered tab stops (`$1`, `$2`, etc.).

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

#### Import Management
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

#### Code Generation
- **Generate Missing Properties**: Adds required properties to resource instances
  - Triggered when resource is missing required schema properties
  - Inserts properties with type-appropriate placeholder values:
    - `string` → `""`
    - `number` → `0`
    - `boolean` → `false`
    - `array` → `[]`
    - `object` → `{}`
    - Custom types → `null`
  - Handles multiple missing properties at once
  - Example: `Add 3 missing properties`

#### Cleanup
- **Remove Unused Variable**: Removes unused `var` declarations
  - Deletes entire line for unused variables
  - For loop variables: Renames to `_` (convention for intentionally unused)
  - For parameters: Renames to `_` (preserves function signature)

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
