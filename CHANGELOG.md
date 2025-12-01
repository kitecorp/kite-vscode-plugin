# Changelog

All notable changes to the Kite Language extension will be documented in this file.

## [0.2.0] - 2024-12-01

### Added

#### Navigation & Intelligence
- **Call Hierarchy** - View incoming/outgoing function calls
- **Go to Type Definition** - Navigate from variables/resources to their schema/component definitions
- **Document Links** - Click on import paths to navigate to files
- **Workspace Symbols** - Search symbols across all workspace files
- **Document Highlight** - Highlight all occurrences of a symbol in the document

#### Editing Features
- **Linked Editing Range** - Simultaneously edit related occurrences:
  - Loop variables (`for item in items`)
  - For comprehensions (`[for env in environments]`)
  - Function parameters
  - Input/output declarations
  - Variables in while/if blocks
  - String interpolation (`${var}` and `$var`)
- **On-Type Formatting** - Auto-indent on newlines and brace alignment

#### Diagnostics
- **Type Mismatch Errors** - Detect wrong types in assignments
- **Unused Variable Detection** - Warning for unused variables, inputs, outputs, and parameters (shown as faded text)

#### Code Actions
- **Add Import** - Quick fix to add missing imports
- **Convert Wildcard Imports** - Convert `import *` to named imports

#### Other Features
- **Code Lens** - Show reference counts on declarations
- **Semantic Tokens** - Enhanced syntax highlighting
- **Folding Ranges** - Collapse code blocks

### Improved
- Smart autocomplete with DevOps-aware suggestions (ports, regions, instance types, CIDRs)
- Cross-file navigation for definitions and references
- Property navigation within schemas and components

## [0.1.0] - Initial Release

### Added
- Syntax highlighting for Kite language
- Intelligent autocomplete with context-aware suggestions
- Go to definition (same file and cross-file)
- Find references
- Hover documentation
- Signature help for function calls
- Rename symbol
- Document symbols (outline view)
- Inlay hints for type information
- Code formatting
- Bracket matching and auto-closing
- Comment toggling
- Code snippets for common patterns
