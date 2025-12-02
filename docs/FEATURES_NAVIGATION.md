# Navigation Features

This document covers navigation and code exploration features of the Kite Language VS Code extension.

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
