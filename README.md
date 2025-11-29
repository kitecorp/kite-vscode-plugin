# Kite Language for VS Code

Full language support for **Kite** - a modern Infrastructure as Code language designed for DevOps engineers.

## Features

### Syntax Highlighting
- Full syntax highlighting for all Kite constructs
- Keywords, types, strings, numbers, comments, decorators
- String interpolation support (`${var}` and `$var`)

### Intelligent Autocomplete
- **Context-aware completions** based on cursor position
- **DevOps-friendly suggestions** for common values:
  - Ports: 80, 443, 22, 3306, 5432, 6379, 8080, 27017
  - Regions: us-east-1, us-west-2, eu-west-1
  - Instance types: t2.micro, t3.small, m5.large
  - CIDR blocks: 10.0.0.0/16, 192.168.0.0/16
  - Environments: dev, staging, prod
  - And many more...
- **Schema property completion** inside resource bodies
- **Component input completion** inside component instances
- **Scope-aware variable suggestions** (only shows variables in scope)
- **Priority ordering**: inputs → variables → resources → components → outputs → functions

### Go to Definition
- Navigate to schema, component, function, and variable definitions
- **Cross-file navigation** for imported symbols
- **Property navigation**: Ctrl+click on property names in resource bodies jumps to schema definition

### Find References
- Find all usages of schemas, components, functions, and variables
- Cross-file reference search

### Hover Documentation
- Quick documentation on hover
- Shows type information, parameters, and descriptions

### Signature Help
- Parameter hints when calling functions
- Shows parameter names and types

### Diagnostics & Validation
- **Import validation**: Warns when using symbols from non-imported files
- **Quick fixes**: Auto-add import statements
- **Decorator validation**: Type checking for decorator arguments
- **Duplicate name detection**: Errors for duplicate names within components

### Smart Defaults
Property-name-aware default value suggestions:

| Property | Suggestions |
|----------|-------------|
| `host` | `"localhost"`, `"0.0.0.0"` |
| `port` | `80`, `443`, `3306`, `5432`... |
| `region` | `"us-east-1"`, `"eu-west-1"`... |
| `environment` | `"dev"`, `"staging"`, `"prod"` |
| `cidr` | `"10.0.0.0/16"`, `"10.0.1.0/24"` |
| `timeout` | `30`, `60`, `300`, `3600` |
| `memory` | `128`, `256`, `512`, `1024` |
| `runtime` | `"nodejs18.x"`, `"python3.11"` |
| `instanceType` | `"t2.micro"`, `"t3.small"` |

## Installation

### From VSIX
```bash
code --install-extension kite-language-0.1.0.vsix
```

### From Source
```bash
git clone https://github.com/kitelang/kite-vscode-plugin
cd kite-vscode-plugin
npm install
npm run compile
```

Then press F5 in VS Code to launch the extension in debug mode.

## Kite Language Quick Reference

```kite
// Imports
import * from "common.kite"
import ServerConfig from "configs.kite"

// Type alias
type Environment = "dev" | "staging" | "prod"

// Schema definition
schema ServerConfig {
  string   host     = "localhost"
  number   port     = 8080
  boolean  ssl      = true
  string[] tags
}

// Resource instantiation
@provider("aws")
@tags({Environment: "production"})
resource ServerConfig webServer {
  host = "api.example.com"
  port = 443
  ssl  = true
  tags = ["web", "production"]
}

// Component definition
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

// Variables
var region = "us-east-1"
var cost = calculateCost(5, "production")

// Functions
fun calculateCost(number instances, string tier) number {
  var baseCost = 0.10
  return instances * baseCost
}
```

## Requirements

- VS Code 1.85.0 or higher

## Extension Settings

This extension currently has no configurable settings.

## Known Issues

See [GitHub Issues](https://github.com/kitelang/kite-vscode-plugin/issues)

## Release Notes

### 0.1.0

Initial release with:
- Syntax highlighting
- Intelligent autocomplete with DevOps-aware suggestions
- Go to definition (including cross-file)
- Find references
- Hover documentation
- Signature help
- Import validation with quick fixes
- Decorator validation
- Duplicate name detection

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md).

## License

MIT
