# Slovenian Tarok

A desktop implementation of the Slovenian 4-player Tarok card game.

## Requirements

- [Node.js](https://nodejs.org/) (v18 or later)

## Setup

```bash
npm install
```

## Build the installer

```bash
npm run electron:build
```

This produces `C:\TarokBuild\Tarok Setup 1.0.0.exe`.

## Install

Run `Tarok Setup 1.0.0.exe` — it installs the game and creates a desktop shortcut.

## Run in a window (without installing)

```bash
npm run electron:dev
```

## Play in a browser instead

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).
