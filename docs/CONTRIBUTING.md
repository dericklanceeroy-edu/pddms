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
const account = {
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

Use implicit return always, if possible.

```ts
const wrongFunction = () => {
    return null
}

const correctFunction = () => null
```

For React, there should be no spaces between tags.

```tsx
function WrongComponent() {
    return (
        <div>
            <h1>Title</h1>
            
            <p>Description</p>
        </div>
    )
}

function CorrectComponent(){
    return (
        <div>
            <h1>Title</h1>
            <p>Description</p>
        </div>
    )
}
```

When commenting, each line should only have 11 words including the comment tag.
```ts
// Note: The database connection string must be stored securely inside individual
// local environment configuration files instead of hardcoding sensitive data directly into
// the source code repository or any public file.
```

When using comment tags, use capitalized tags with dashes between words followed by a colon, and a capitalized sentence ending with a period.
```ts
// Note: Validate the payload before updating the account.
// To-do: Add support for updating the account's username.
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
- Wrap code-related identifiers in backticks.

> [!NOTE]
> GitHub commit messages backticks requires backslash prefix.
