# Refactoring & Editing Features

This document covers refactoring and advanced editing features of the Kite Language VS Code extension.

---

## 22. Call Hierarchy

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

## 23. Linked Editing Range

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

## 24. Document Links

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

## 25. On Type Formatting

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

## 26. Unused Variables Detection

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

## 27. Go to Type Definition

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

## 28. Indexed Resources

**Related:** Completions, Validation, Go to Definition, Hover

Complete support for resources and components created inside loops or with the `@count` decorator. These resources are accessed using indexed notation like `server[0]` or `data["prod"]`.

### Creating Indexed Resources

| Pattern | Index Type | Example Access |
|---------|------------|----------------|
| `@count(n)` | Numeric (0 to n-1) | `server[0]`, `server[1]` |
| `for i in 0..n` | Numeric (0 to n-1) | `server[0]`, `server[1]` |
| `for x in ["a", "b"]` | String keys | `data["a"]`, `data["b"]` |

### Example: @count Decorator

```kite
@count(3)
resource EC2.Instance server {
    name = "server-$count"
}

// Access instances:
var first = server[0]
var second = server[1]
var third = server[2]
```

### Example: Range Loop

```kite
for i in 0..5 {
    resource S3.Bucket bucket {
        name = "bucket-${i}"
    }
}

// Access instances:
var b0 = bucket[0]
var b4 = bucket[4]
```

### Example: Array Loop (String Keys)

```kite
var environments = ["dev", "staging", "prod"]

[for env in environments]
resource RDS.Instance database {
    name = "db-${env}"
}

// Access instances:
var devDb = database["dev"]
var prodDb = database["prod"]
```

### Features

| Feature | Description |
|---------|-------------|
| **Completions** | Suggests indexed access patterns (e.g., `server[0]`) when typing |
| **Index Completions** | When typing `[` after a resource, suggests valid indices |
| **Property Completions** | `server[0].` (Ctrl+Space) shows schema properties like `port`, `host` |
| **Validation** | Checks index type matches (numeric vs string) |
| **Bounds Checking** | Warns when index is out of bounds (when known) |
| **Key Validation** | Warns when string key is not in allowed list |
| **Go to Definition** | Ctrl+Click on `server[0]` navigates to the declaration |
| **Hover** | Shows indexed resource info (count, keys, access pattern) |

### Validation Errors

| Error | Example | Message |
|-------|---------|---------|
| Non-indexed access | `server[0]` (no @count) | `'server' is not an indexed resource` |
| Type mismatch | `data[0]` on string-indexed | `'data' uses string keys, not numeric indices` |
| Out of bounds | `server[5]` on @count(3) | `Index 5 is out of bounds (0-2)` |
| Invalid key | `data["unknown"]` | `Key "unknown" is not valid. Accepts: "dev", "prod"` |

### Hover Documentation

Hovering over an indexed resource shows:
- The indexing method (count, range, or string keys)
- The valid access patterns

```
resource `server`
Schema: EC2.Instance

**Indexed resource with 3 instances (0-2) via @count(3)**

Access using: server[0], server[1], server[2]
```

### Implementation Files

| File | Description |
|------|-------------|
| `types.ts` | `IndexedResourceInfo` interface |
| `ast-scanner.ts` | Extracts @count and loop context |
| `ast-cursor.ts` | `getDotAccessTarget()` - handles `db[0].` property access detection |
| `indexed-resources.ts` | Utility functions |
| `declaration-completions.ts` | Indexed access completions |
| `property-access.ts` | Property completions for resources/components |
| `indexed-access.ts` | Validation checks |
| `definition/index.ts` | Go to definition support |
| `hover/index.ts` | Hover documentation |
