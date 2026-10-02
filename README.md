# Beaver 🦫 — sticky-note tasks for you and your team

Beaver is a self-hosted task board where every task is a sticky note. It runs on your own server and stores everything in a single SQLite file you own. Use it in the browser, install it as an app from Edge or Chrome, or run the Windows desktop app.

## Features

- **Sticky-note wall.** Each new note gets a handwritten font (Caveat) and a random pastel color. You can change any note's color, font, font size and size. To resize a note, drag its bottom-right corner.
- **Dated notes come first.** Notes with a due date sit at the top in a *Scheduled* section, sorted by date. Badges show how close each one is:
  - ⚠ **Overdue**: red and pulsing.
  - 🔔 **Due today**: orange.
  - 🕒 **Due soon**: tomorrow or the day after.
  - 📅 **Later**: just the date.
  - 🔥 **Urgent**: a flag you set yourself.
- **Changing a date.** Click a note's date badge, or the calendar button on a note without a date. You get *Today / Tomorrow / Next week* shortcuts, a date and optional time, or *Remove date*.
- **Wall or List view.** The list is a sortable table with Task, Assigned to, Assigned by, Due, Status, Completed and Created columns.
- **Team sidebar.** Click a teammate to see:
  - Tasks you assigned to them.
  - Their own notes, if your level is above theirs.
  - Tasks they assigned to you.
- **Private notes.** Your own personal space. Nobody else can see these notes, not even admins.
- **Levels (roles and hierarchy).** Level 1 is the top, and you can add as many levels as you like. For each level you choose which levels its members may submit tasks to. All of this lives in **Settings → Levels**.
- **Reminders.** Optional desktop notifications when your tasks are due (Settings → Note defaults).
- Dark mode, phone-friendly layout, and installable as an app.

## Quick start

You need **Node.js 22.13 or newer** (https://nodejs.org).

```bash
npm install
npm start
```

Open http://localhost:3000. The first time you open it, Beaver asks you to create the admin account, which goes in at Level 1. Then go to **Settings**:

1. **Levels**: rename the default levels (*Leadership*, *Team*), add more, reorder them, and tick which levels each level can submit tasks to.
2. **Team members**: add people with a username, temporary password and level. They can change their password under *My account*.
3. **Note defaults**: your default font, font size, note size, color mode (random or fixed) and reminders.

### Configuration

| Variable      | Default           | Meaning |
|---------------|-------------------|---------|
| `PORT`        | `3000`            | Port to listen on |
| `HOST`        | `0.0.0.0`         | Interface to bind |
| `BEAVER_DB`   | `./data/beaver.db`| Where the database file lives |
| `TRUST_PROXY` | *(off)*           | Set to `1` behind a reverse proxy that terminates HTTPS, so sign-in cookies are marked secure |

## Hosting it yourself

**Backups.** All data lives in one file, `data/beaver.db`. To back up, copy it, together with any `beaver.db-wal` file next to it, or run `sqlite3 data/beaver.db ".backup backup.db"`.

**On a Windows server or PC:**

1. Install Node.js 22 LTS, copy this folder over, then run `npm install --omit=dev`.
2. Run it as a background service, for example with [NSSM](https://nssm.cc):
   `nssm install Beaver "C:\Program Files\nodejs\node.exe" "--disable-warning=ExperimentalWarning C:\Beaver\server\index.js"`.
   Alternatively, use `pm2` with `pm2-windows-startup`.
3. Open the port in Windows Firewall, or put IIS or Caddy in front of it for HTTPS.

**With Docker:**

```bash
docker build -t beaver .
docker run -d --name beaver -p 3000:3000 -v beaver-data:/data --restart unless-stopped beaver
```

**HTTPS.** If people reach Beaver over the internet, put it behind a reverse proxy with HTTPS (Caddy, nginx, IIS) and set `TRUST_PROXY=1`. Here's a minimal Caddyfile:

```
tasks.example.com {
  reverse_proxy localhost:3000
}
```

## Windows desktop app

`desktop/` holds a small Electron app that opens your Beaver server in its own window. You get a taskbar icon, Windows notifications for reminders, and a *File → Change server…* menu.

```bash
cd desktop
npm install
npm start          # try it
npm run dist       # build an installer + portable .exe into desktop/dist (run on Windows)
```

The first time it launches, it asks for your server address, for example `http://localhost:3000` or `https://tasks.example.com`.

You don't need to build anything to get an app window, though. In Edge or Chrome, open your Beaver URL and choose **Install Beaver** from the address bar or the ⋯ menu.

## Who can see and do what

| | Author | Assignee | Members above the author* | Everyone else |
|---|---|---|---|---|
| Own note (not private) | edit, delete | — | view | — |
| Private note | edit, delete | — | — | — |
| Assigned task | edit text, date and assignee; delete | mark done, change color, size and font | — | — |

\* "Above" means the viewer's level is allowed to submit tasks to the author's level (Settings → Levels).

Admins manage levels and members. They **cannot** read anyone's private notes.

## Development

```bash
npm run dev   # restart on file changes
npm test      # API tests (node:test)
```

Project layout:

- `server/`: Express API with SQLite storage through the built-in `node:sqlite`.
- `public/`: the web app, plain ES modules with no build step. Fonts are served locally from `@fontsource`.
- `desktop/`: the Electron shell for Windows.
- `test/`: API tests.
