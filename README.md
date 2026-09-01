# pddms

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

The application uses `./pddms.db` by default. Copy `.env.example` to `.env` only when custom
database paths are needed. Database files are ignored by Git.

Initialize or update the local database manually with:

```bash
$ npm run setup:dev
```

### Development

```bash
$ npm run dev
```

`npm run dev` runs migrations before Electron starts. On an empty database, the application opens
the first-launch flow and requires creation of the master account. No default credentials or
development account are created.

Authentication sessions are held by the Electron main process. Renderer refreshes retain the
current session, while fully quitting and restarting the application requires signing in again.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
