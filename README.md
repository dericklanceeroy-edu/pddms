# pddms

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

Copy `.env.example` to `.env`. The example configures a local development database and the
idempotent development master account:

```text
username: medprix
password: medprix123
```

`DEV_MASTER_USERNAME` and `DEV_MASTER_PASSWORD` are optional overrides. When omitted, the seed uses
the documented development credentials above. These values are read only by the development
database seed and are never embedded in the renderer.

Initialize or update the local database manually with:

```bash
$ npm run setup:dev
```

### Development

```bash
$ npm run dev
```

`npm run dev` automatically runs migrations and the idempotent development seed before Electron
starts. Re-running it does not create duplicate master accounts.

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
