# Kite VS Code Extension - TODO

## Completed Features (v0.2.0)
- [x] Call Hierarchy - show incoming/outgoing calls for functions
- [x] Linked Editing Range - edit all occurrences simultaneously
- [x] Document Links - make import paths clickable
- [x] On Type Formatting - auto-format as you type
- [x] Type mismatch errors - diagnostic for wrong types
- [x] Unused variables - warning for unused var declarations
- [x] Go to Type Definition - navigate from variable to schema

## Completed Features (v0.3.0)
- [x] Missing required properties - error for incomplete resources
- [x] Generate missing properties - code action to add required properties
- [x] Reserved names validation - error for keywords/types as property names
- [x] Duplicate property detection - error for duplicate names in schemas/resources
- [x] Decorator target validation - error when decorator applied to wrong target
- [x] Array type checking - `any[] = "string"` now shows error
- [x] Find Implementations - find resources using a schema
- [x] Sort imports - alphabetically sort import statements

## Completed Features (v0.4.0)
- [x] Remove unused variable - quick fix to delete unused var declarations (renames loop vars/params to `_`)
- [x] Decorator argument validation - check decorator arguments match expected types
- [x] Circular import detection - error for circular dependencies
- [x] Named import parsing - `import A, B from "path"` syntax support
- [x] Import symbol completions - suggest symbols after `import `
- [x] Import path completions - suggest `.kite` files inside quotes
- [x] Go to definition for import symbols - click symbol in import to jump to source
- [x] Organize imports - merge duplicates, sort alphabetically (`Shift+Alt+O`)
- [x] Add all missing imports - bulk import action after paste
- [x] Auto-import on paste - automatically adds missing imports when pasting code
- [x] Auto-import on type - suggests importable symbols with automatic import insertion
- [x] Missing value validation - error when `=` has no value after it
- [x] Organize imports on save - automatically organizes imports when saving

## Completed Features (v0.5.0) - Diagnostics/Validation
- [x] Duplicate parameters - error for duplicate function parameter names
- [x] Duplicate declarations - error for duplicate top-level declaration names
- [x] Unknown decorator - error for unrecognized decorator names
- [x] Duplicate decorator - error when same decorator applied multiple times
- [x] Empty block - warning for empty schema/component/function bodies
- [x] Invalid number - error for malformed number literals
- [x] Unclosed string - error for strings without closing quote
- [x] Missing return - error for typed functions without return statement
- [x] Unreachable code - warning for code after return statement
- [x] Variable shadowing - warning when inner variable shadows outer variable
- [x] Invalid import path - error when import file doesn't exist
- [x] Return outside function - error for return at top level
- [x] Invalid string interpolation - error for unclosed ${
- [x] Unused function - warning for functions never called
- [x] Division by zero - warning for literal / 0 or % 0
- [x] Infinite loop - warning for while true without break/return
- [x] Assignment in condition - warning for = instead of == in if/while
- [x] Self-assignment - warning when variable assigned to itself (x = x)
- [x] Comparison to self - warning when comparing variable to itself (x == x)
- [x] Duplicate import - warning when same file imported multiple times
- [x] Constant condition - warning for always true/false if/while conditions
- [x] Too many parameters - warning for functions with 6+ parameters
- [x] Redundant condition - warning for x && x or x || x
- [x] Type coercion - warning for comparing different types (number == string)
- [x] Empty string check - hint suggesting len(str) == 0 instead of str == ""
- [x] Redundant boolean - warning for x == true → x, x == false → !x
- [x] Negated comparison - hint for !(x == y) → x != y
- [x] Useless expression - warning for statements with no effect (x + 1)
- [x] Long function - warning for functions with 50+ lines
- [x] Unused parameter - warning for function parameters never used
- [x] Implicit any - hint for variables where type can't be inferred
- [x] Syntax errors - improved, user-friendly error messages for parse errors

## Pending Features

## Skipped / Deferred

### Code Actions
- [ ] Extract to variable - extract expression to a variable
