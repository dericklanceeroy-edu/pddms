*Thank you for giving the time and effort for contributing to this project!* 🎉

&mdash; *Dan, Derick, and Gabril*

## Style Guides

Organize each code block into three sections:

1. Variables
2. Process
3. Terminate (optional, `return` or `throw`)

For example:
```ts
// Variables
const x = 5
const y = 10
let sum: number

// Process
sum = x + y

// Terminate
return sum
```

Separate variables that don't relate to one another.

```ts
const user = {
  // ...
}

const retries = 5;
const timeout = 10 * 1000;
```

Group the variables to the process that they are tightly related to.

```ts
// This is a shared variable.
const shared = null;

let i = 0;
while (i < 5) {
  // ...
}
```

Unless otherwise specified, follow the conventions of the technologies used.

## Commit Messages

### Scope 🔭
- Keep commit messages focused on a single change.
- Split unrelated changes into separate commits.

### Style 💅
- Start with a capital letter.
- Only one sentence without a period.
- Keep the message concise, ideally under 72 characters.
- Use present-tense verbs consistently.

### Format 🖊️
- Prefix with the ticket code in brackets and then the ticket title, if applicable.
- Wrap code-related identifiers in backticks.

> [!NOTE]
> GitHub commit messages backticks requires backslash prefix.
