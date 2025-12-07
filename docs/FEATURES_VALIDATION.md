# Diagnostics & Validation

**File:** `src/server/handlers/validation/`

A comprehensive set of validation rules that detect common errors and code quality issues.

---

## Duplicate Parameters

**File:** `duplicate-parameters.ts`

Reports error when a function has duplicate parameter names.

```kite
fun calculate(number x, string x) {  // Error: Duplicate parameter 'x'
    return x
}
```

---

## Duplicate Declarations

**File:** `duplicate-declarations.ts`

Reports error when multiple top-level declarations have the same name, or when variables within a function scope are duplicated.

### Top-level duplicates
```kite
schema Config { }
schema Config { }  // Error: Duplicate declaration 'Config'

fun process() { }
fun process() { }  // Error: Duplicate declaration 'process'
```

### Function-scope duplicates
```kite
fun calculate(number x) {
    var x = 12  // Error: Variable 'x' is already declared as parameter
    return x
}

fun test() {
    var y = 10
    var y = 20  // Error: Duplicate variable 'y'
    return y
}
```

**Note:** Variables with the same name in different functions are allowed, as they are in different scopes.

---

## Unknown Decorator

**File:** `unknown-decorator.ts`

Reports error for unrecognized decorator names.

```kite
@invalidDecorator  // Error: Unknown decorator '@invalidDecorator'
resource Config srv { }

@description("Valid")  // OK - recognized decorator
resource Config db { }
```

---

## Duplicate Decorator

**File:** `duplicate-decorator.ts`

Reports error when the same decorator is applied multiple times to a single declaration.

```kite
@description("First")
@description("Second")  // Error: Duplicate decorator '@description'
schema Config { }
```

---

## Empty Block

**File:** `empty-block.ts`

Reports warning for empty schema, component, or function bodies.

```kite
schema Config { }     // Warning: Empty schema 'Config'
component Server { }  // Warning: Empty component 'Server'
fun calculate() { }   // Warning: Empty function 'calculate'

schema Valid {        // OK - has content
    string name
}
```

---

## Invalid Number

**File:** `invalid-number.ts`

Reports error for malformed number literals.

```kite
var x = 123abc   // Error: Invalid number literal '123abc'
var y = 1.2.3    // Error: Invalid number literal '1.2.3'
var z = 123      // OK
var w = 3.14     // OK
```

---

## Unclosed String

**File:** `unclosed-string.ts`

Reports error for strings without closing quotes.

```kite
var x = "hello    // Error: Unclosed string literal
var y = "world"   // OK
```

---

## Missing Return

**File:** `missing-return.ts`

Reports error when a function declares a return type but has no return statement.

```kite
fun calculate(number x) number {  // Error: Function 'calculate' has return type 'number' but no return statement
    var y = x * 2
}

fun valid(number x) number {      // OK
    return x * 2
}

fun noType() {                    // OK - no return type declared
    println("hello")
}
```

---

## Return Type Mismatch

**File:** `return-type-mismatch.ts`

Reports error when a function's return value type doesn't match its declared return type.

```kite
fun calculate() string {
    return 42  // Error: Return type mismatch: expected 'string' but got 'number'
}

fun getPort() number {
    return "8080"  // Error: Return type mismatch: expected 'number' but got 'string'
}

fun isEnabled() boolean {
    return 1  // Error: Return type mismatch: expected 'boolean' but got 'number'
}

fun valid() number {
    return 42  // OK - types match
}

fun flexible() any {
    return 42  // OK - 'any' accepts all types
}

fun nullable() string {
    return null  // OK - null is compatible with any type
}

fun withVariable() number {
    var result = 42
    return result  // OK - inferred type matches
}

fun mismatchVariable() number {
    var result = "42"
    return result  // Error: Return type mismatch: expected 'number' but got 'string'
}

fun withExplicitType() string {
    var number port = 8080
    return port  // Error: Return type mismatch: expected 'string' but got 'number'
}

fun arrayElementMismatch() number[] {
    var name = "Alice"
    return [name]  // Error: Return type mismatch: expected 'number[]' but got 'string[]'
}
```

**Features:**
- Validates literal return values (numbers, strings, booleans, arrays, objects, null)
- **Infers variable types** from their assignments and explicit type annotations
- Checks variable returns against function return type
- **Validates array element types** for arrays containing single variables (e.g., `[varName]`)
- Supports both `var name = value` and `var type name = value` syntax

**Limitations:**
- Does not track variable reassignments (uses first assignment only)
- Cannot infer types from function calls or complex expressions
- Array element checking only works for single-variable arrays (e.g., `[x]`, not `[x, y]`)

---

## Unreachable Code

**File:** `unreachable-code.ts`

Reports warning for code after a return statement.

```kite
fun calculate() number {
    return 42
    var x = 10    // Warning: Unreachable code after return statement
}
```

---

## Variable Shadowing

**File:** `variable-shadowing.ts`

Reports warning when an inner variable shadows an outer variable with the same name.

```kite
var x = 10
fun calculate() {
    var x = 20    // Warning: Variable 'x' shadows outer variable
}

var item = "test"
for item in items {  // Warning: Variable 'item' shadows outer variable
    println(item)
}
```

---

## Invalid Import Path

**File:** `invalid-import-path.ts`

Reports error when an import references a file that doesn't exist.

```kite
import * from "nonexistent.kite"  // Error: Cannot find file 'nonexistent.kite'
import Config from "missing.kite"  // Error: Cannot find file 'missing.kite'

import * from "common.kite"        // OK - file exists
```

Supports:
- Simple filenames (`common.kite`)
- Relative paths (`./utils/config.kite`, `../shared.kite`)
- Package-style imports (`aws.Database` -> `aws/Database.kite`)

---

## Return Outside Function

**File:** `return-outside-function.ts`

Reports error when a return statement is used outside of a function body.

```kite
return 42           // Error: 'return' statement outside of function

schema Config {
    return 42       // Error: 'return' statement outside of function
}

fun calculate() number {
    return 42       // OK - inside function
}
```

---

## Invalid String Interpolation

**File:** `invalid-string-interpolation.ts`

Reports error when a string has unclosed `${...}` interpolation.

```kite
var x = "Hello ${name"      // Error: Unclosed string interpolation '${'
var y = "Value: ${a.b"      // Error: Unclosed string interpolation '${'

var z = "Hello ${name}"     // OK - properly closed
var w = "Price: $100"       // OK - simple $ not interpolation
var v = 'No ${interp}'      // OK - single quotes don't interpolate
```

---

## Unused Function

**File:** `unused-function.ts`

Reports warning when a function is declared but never called.

```kite
fun helper() number {       // Warning: Function 'helper' is declared but never called
    return 42
}

fun calculate() number {    // OK - called below
    return 1
}

var result = calculate()

fun recursive(number n) {   // OK - calls itself
    recursive(n - 1)
}
```

---

## Division by Zero

**File:** `division-by-zero.ts`

Reports warning when dividing or using modulo with a literal zero.

```kite
var x = 10 / 0      // Warning: Division by zero
var y = 10 % 0      // Warning: Modulo by zero
var z = 10 / 0.0    // Warning: Division by zero

var a = 10 / 2      // OK
var b = 10 / n      // OK - variable could be non-zero
```

---

## Infinite Loop

**File:** `infinite-loop.ts`

Reports warning when a `while true` loop has no `break` or `return` statement.

```kite
while true {                    // Warning: Infinite loop
    println("forever")
}

while true {                    // OK - has break
    if done {
        break
    }
}

while true {                    // OK - has return
    if finished {
        return result
    }
}

while running {                 // OK - condition is not literal true
    process()
}
```

---

## Assignment in Condition

**File:** `assignment-in-condition.ts`

Reports warning when using `=` instead of `==` in if/while conditions.

```kite
if x = 5 {          // Warning: Assignment in condition. Did you mean '=='?
    println("x")
}

while y = true {    // Warning: Assignment in condition. Did you mean '=='?
    process()
}

if x == 5 {         // OK - comparison
    println("x")
}

if x != 5 {         // OK - comparison
    println("x")
}
```

---

## Self-Assignment

**File:** `self-assignment.ts`

Reports warning when a variable is assigned to itself.

```kite
var x = x           // Warning: Self-assignment: 'x' is assigned to itself
x = x               // Warning: Self-assignment: 'x' is assigned to itself

var x = y           // OK - different variable
x += x              // OK - compound assignment
config.name = config.name  // OK - property access (might be intentional)
```

---

## Comparison to Self

**File:** `comparison-to-self.ts`

Reports warning when comparing a variable to itself (always true or always false).

```kite
if x == x {         // Warning: Comparison to self: 'x == x' is always true
    println("always")
}

if x != x {         // Warning: Comparison to self: 'x != x' is always false
    println("never")
}

if x >= x {         // Warning: always true
if x > x {          // Warning: always false

if x == y {         // OK - different variables
if obj.x == obj.x { // OK - property access (might have side effects)
```

---

## Duplicate Import

**File:** `duplicate-import.ts`

Reports warning when the same file is imported multiple times.

```kite
import * from "common.kite"
import * from "common.kite"    // Warning: Duplicate import: 'common.kite' already imported on line 1

import { A } from "utils.kite"
import { B } from "utils.kite"  // Warning: Duplicate import

import * from "common"
import * from "common.kite"     // Warning: same file (normalizes extensions)
```

---

## Constant Condition

**File:** `constant-condition.ts`

Reports warning when if/while conditions are always true or always false.

```kite
if true {           // Warning: Constant condition: 'true' is always true
    println("always")
}

if false {          // Warning: Constant condition: 'false' is always false
    println("never")
}

while true {        // Warning: Constant condition: 'true' is always true
    process()
}

if 1 == 1 {         // Warning: Constant condition: '1 == 1' is always true
if 1 == 2 {         // Warning: Constant condition: '1 == 2' is always false
if "a" == "a" {     // Warning: always true
if !false {         // Warning: always true
if true || x {      // Warning: always true (short-circuit)
if false && x {     // Warning: always false (short-circuit)

if x {              // OK - variable condition
if isValid() {      // OK - function call
```

---

## Too Many Parameters

**File:** `too-many-parameters.ts`

Reports warning when a function has more than 5 parameters.

```kite
fun process(number a, number b, number c, number d, number e, number f) {  // Warning
    // Consider using a schema to group parameters
}

fun calculate(number x, number y, number z) number {  // OK - 3 parameters
    return x + y + z
}
```

---

## Redundant Condition

**File:** `redundant-condition.ts`

Reports warning when conditions have duplicate operands.

```kite
if x && x {         // Warning: 'x && x' is equivalent to 'x'
    process()
}

if enabled || enabled {  // Warning: 'enabled || enabled' is equivalent to 'enabled'
    start()
}

if a && b {         // OK - different operands
    process()
}
```

---

## Type Coercion

**File:** `type-coercion.ts`

Reports warning when comparing values of different types.

```kite
if 5 == "5" {       // Warning: comparing number with string
    println("coercion")
}

if true == 1 {      // Warning: comparing boolean with number
    println("coercion")
}

if null == 0 {      // Warning: comparing null with number
    println("coercion")
}

if 5 == 10 {        // OK - same type (number)
    println("ok")
}
```

---

## Empty String Check

**File:** `empty-string-check.ts`

Reports hint suggesting `len(str) == 0` instead of `str == ""`.

```kite
if name == "" {     // Hint: consider using 'len(name) == 0'
    println("empty")
}

if "" != value {    // Hint: consider using 'len(value) != 0'
    process()
}

if name == "hello" {  // OK - non-empty string comparison
    greet()
}
```

---

## Redundant Boolean

**File:** `redundant-boolean.ts`

Reports warning for redundant boolean comparisons.

```kite
if isValid == true {   // Warning: can be simplified to 'isValid'
    process()
}

if isValid == false {  // Warning: can be simplified to '!isValid'
    handleError()
}

if isValid != true {   // Warning: can be simplified to '!isValid'
    handleError()
}

if isValid != false {  // Warning: can be simplified to 'isValid'
    process()
}

if a == b {           // OK - not a boolean literal comparison
    process()
}
```

---

## Negated Comparison

**File:** `negated-comparison.ts`

Reports hint for negated comparisons that can be simplified.

```kite
if !(x == y) {      // Hint: can be simplified to 'x != y'
    process()
}

if !(a > b) {       // Hint: can be simplified to 'a <= b'
    process()
}

if !(count < 10) {  // Hint: can be simplified to 'count >= 10'
    stop()
}

if x != y {         // OK - already simplified
    process()
}
```

---

## Useless Expression

**File:** `useless-expression.ts`

Reports warning for statements with no side effects.

```kite
fun test() {
    x + 1           // Warning: 'x + 1' has no effect. Did you forget to assign?
    a - b           // Warning: has no effect
    c * d           // Warning: has no effect
}

fun valid() {
    var result = x + 1   // OK - assigned to variable
    x += 1               // OK - compound assignment
    println(x + 1)       // OK - passed to function
    return x + 1         // OK - returned
}
```

---

## Long Function

**File:** `long-function.ts`

Reports warning when a function exceeds 50 lines.

```kite
fun veryLongFunction() {    // Warning: Function is 75 lines long
    // ... many lines of code ...
    // Consider breaking into smaller functions
}

fun shortFunction() {       // OK - under 50 lines
    var x = 1
    return x * 2
}
```

Empty lines and comment-only lines are not counted.

---

## Unused Parameter

**File:** `unused-parameter.ts`

Reports warning when function parameters are never used.

```kite
fun calculate(number x) number {  // Warning: Parameter 'x' never used
    return 42
}

fun process(number _unused) {     // OK - prefixed with underscore
    println("ignoring parameter")
}

fun valid(number x) number {      // OK - parameter is used
    return x * 2
}
```

Parameters prefixed with `_` are considered intentionally unused.

---

## Implicit Any

**File:** `implicit-any.ts`

Reports hint when variable type cannot be inferred.

```kite
var result = getData()      // Hint: implicit 'any' type
var value = obj.getValue()  // Hint: implicit 'any' type
var copy = original         // Hint: implicit 'any' type

var name = "hello"          // OK - inferred as string
var count = 42              // OK - inferred as number
var flag = true             // OK - inferred as boolean
var items = [1, 2, 3]       // OK - inferred as array

var string name = getData() // OK - explicit type annotation
```

---

## Syntax Errors

**File:** `syntax-errors.ts`

Reports user-friendly error messages for parse errors, providing clearer guidance than raw parser errors.

---

## Duplicate Properties

**File:** `duplicate-properties.ts`

Reports error when property names are duplicated in schemas, resources, or component instances.

```kite
schema Config {
    string host
    number host      // Error: Duplicate property 'host' in schema 'Config'
}

resource Config web {
    host = "localhost"
    host = "127.0.0.1"  // Error: Duplicate property 'host' assignment
}
```

Checked in:
- Schema property definitions
- Resource property assignments
- Component instance input assignments

---

## Decorator Arguments

**File:** `decorator-arguments.ts`

Validates that decorator arguments match expected types.

| Decorator | Expected Type | Error Message |
|-----------|---------------|---------------|
| @minValue, @maxValue | number or variable | requires a number argument |
| @minLength, @maxLength | number or variable | requires a number argument |
| @count | number or variable | requires a number argument |
| @description | string | requires a string argument |
| @existing | string | requires a string argument |
| @allowed | array | requires an array argument |
| @nonEmpty, @sensitive, @unique | none | takes no arguments |
| @tags | object, array, or string | requires an object, array, or string |
| @provider | string or array | requires a string or array argument |
| @dependsOn | identifier or array | requires a resource reference |
| @validate | named (regex: or preset:) | requires named argument |

```kite
@minValue("10")      // Error: @minValue requires a number argument
@nonEmpty(true)      // Error: @nonEmpty takes no arguments
@description(42)     // Error: @description requires a string argument

@minValue(10)        // OK
@description("...")  // OK
@nonEmpty            // OK
@count(replicas)     // OK - variable references allowed
```

---

## Decorator Targets

**File:** `decorator-targets.ts`

Reports error when decorators are applied to invalid targets.

| Decorator | Valid Targets |
|-----------|---------------|
| @minValue, @maxValue | input, output |
| @minLength, @maxLength | input, output |
| @validate | input, output |
| @sensitive | input, output |
| @nonEmpty | input |
| @allowed | input |
| @unique | input |
| @existing | resource |
| @dependsOn | resource, component instance |
| @tags | resource, component instance |
| @provider | resource, component instance |
| @count | resource, component instance |
| @description | all (universal) |

```kite
@nonEmpty                    // Error: @nonEmpty can only be applied to input
schema Config { }

@existing("arn:aws:...")     // Error: @existing can only be applied to resource
component Server { }

@tags({ Team: "platform" })  // Error: @tags can only be applied to resource or component instance
component WebServer {
    input string name
}

@nonEmpty                    // OK - applied to input
input string name
```

---

## Reserved Names

**File:** `reserved-names.ts`

Reports error when keywords or type names are used as property/input/output names.

**Reserved words include:**
- **Types:** `string`, `number`, `boolean`, `any`, `object`, `void`, `null`
- **Keywords:** `if`, `else`, `for`, `while`, `in`, `return`, `var`, `fun`, `schema`, `component`, `resource`, `input`, `output`, `type`, `import`, `from`, `init`, `this`, `true`, `false`

```kite
schema Config {
    string string     // Error: 'string' is a reserved word
    number if         // Error: 'if' is a reserved word
}

component Server {
    input string var  // Error: 'var' is a reserved word
    output number return  // Error: 'return' is a reserved word
}
```

---

## Missing Properties

**File:** `missing-properties.ts`

Reports error when resource instances are missing required schema properties.

**Required property** = property declared without a default value AND without `@cloud` decorator.

**Property types:**
- **Regular property (no default)** - Required, must be provided in resource instance
- **Property with default** - Optional, uses default if not provided
- **@cloud property** - Set by cloud provider after apply, never required

```kite
schema ServerConfig {
    string host             // Required (no default)
    number port = 8080      // Optional (has default)
    @cloud string arn       // Cloud-generated (never required)
}

resource ServerConfig web { }     // Error: Missing required property 'host'

resource ServerConfig db {
    host = "localhost"      // OK - required property provided
    // arn is NOT required - it's set by the cloud provider
}
```

**Note:** Component inputs are NOT checked - all inputs are optional (prompted at CLI runtime).

---

## Circular Imports

**File:** `circular-imports.ts`

Detects when files import each other in a circular manner.

```kite
// a.kite
import * from "b.kite"     // Error: Circular import: a.kite -> b.kite -> a.kite

// b.kite
import * from "a.kite"

// self-import
import * from "current.kite"  // Error: Circular import: File imports itself
```

**Features:**
- Detects direct circular imports (A → B → A)
- Detects indirect cycles (A → B → C → A)
- Detects self-imports
- Shows full cycle chain in error message

---

## Summary Table

| Validation | Severity | File |
|------------|----------|------|
| Duplicate parameters | Error | `duplicate-parameters.ts` |
| Duplicate declarations | Error | `duplicate-declarations.ts` |
| Unknown decorator | Error | `unknown-decorator.ts` |
| Duplicate decorator | Error | `duplicate-decorator.ts` |
| Empty block | Warning | `empty-block.ts` |
| Invalid number | Error | `invalid-number.ts` |
| Unclosed string | Error | `unclosed-string.ts` |
| Missing return | Error | `missing-return.ts` |
| Unreachable code | Warning | `unreachable-code.ts` |
| Variable shadowing | Warning | `variable-shadowing.ts` |
| Invalid import path | Error | `invalid-import-path.ts` |
| Return outside function | Error | `return-outside-function.ts` |
| Invalid string interpolation | Error | `invalid-string-interpolation.ts` |
| Unused function | Warning | `unused-function.ts` |
| Division by zero | Warning | `division-by-zero.ts` |
| Infinite loop | Warning | `infinite-loop.ts` |
| Assignment in condition | Warning | `assignment-in-condition.ts` |
| Self-assignment | Warning | `self-assignment.ts` |
| Comparison to self | Warning | `comparison-to-self.ts` |
| Duplicate import | Warning | `duplicate-import.ts` |
| Constant condition | Warning | `constant-condition.ts` |
| Too many parameters | Warning | `too-many-parameters.ts` |
| Redundant condition | Warning | `redundant-condition.ts` |
| Type coercion | Warning | `type-coercion.ts` |
| Empty string check | Hint | `empty-string-check.ts` |
| Redundant boolean | Warning | `redundant-boolean.ts` |
| Negated comparison | Hint | `negated-comparison.ts` |
| Useless expression | Warning | `useless-expression.ts` |
| Long function | Warning | `long-function.ts` |
| Unused parameter | Warning | `unused-parameter.ts` |
| Implicit any | Hint | `implicit-any.ts` |
| Syntax errors | Error | `syntax-errors.ts` |
| Duplicate properties | Error | `duplicate-properties.ts` |
| Decorator arguments | Error | `decorator-arguments.ts` |
| Decorator targets | Error | `decorator-targets.ts` |
| Reserved names | Error | `reserved-names.ts` |
| Missing properties | Error | `missing-properties.ts` |
| Circular imports | Error | `circular-imports.ts` |
