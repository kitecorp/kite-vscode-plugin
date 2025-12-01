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

## Pending Features

## Skipped / Deferred

### Code Actions
- [ ] Extract to variable - extract expression to a variable
