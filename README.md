# BUS123 Mission Control

Private local control panel for BUS123 course-material workflows.

Mission Control serves:

- The control panel at `http://localhost:8123/`
- A local preview of the public student-facing course map at `http://localhost:8124/`

The Desktop app starts one detached Node process for both services and opens the control panel in the default browser.

## Repository Contents

- `server.mjs`: local HTTP server, API endpoints, material scan, and public preview
- `index.html`: Mission Control interface
- `assets/`: interface styles and JavaScript
- `launchers/BUS123-Mission-Control.app/`: Desktop launcher source bundle
- `launchers/BUS123MissionControl.iconset/`: launcher icon source assets

Runtime logs are written to `logs/` and intentionally excluded from Git.

## Install the Desktop App

From this repository:

```sh
rm -rf "$HOME/Desktop/BUS123 Mission Control.app"
cp -R "launchers/BUS123-Mission-Control.app" "$HOME/Desktop/BUS123 Mission Control.app"
```

Then open `BUS123 Mission Control.app` from the Desktop.

## Local Paths

The launcher expects these sibling repositories:

```text
~/Documents/GitHub/BUS123-mission-control-active
~/Documents/GitHub/BUS123-Solving-Business-Problems-with-Technology
~/Documents/GitHub/BUS123-instructor
```

Keep this repository private. It contains instructor workflow tooling and local operational details that do not belong in the public student-facing course-materials repository.
