# macOS setup

Install Node.js 24.22.3 for your Mac from the official Node distribution. In Terminal, enter the extracted project folder, confirm `node --version`, then follow [Start here](START_HERE.md). Run `npm start` for the loopback preview and open `http://127.0.0.1:8800/`. The macOS launcher is also included. Keep the server terminal open.

For the opt-in local HTTPS preview, follow [Server setup](docs/SERVER-SETUP.md) for OpenSSL, the scoped local resolver and a trusted test CA. For hosting use the production instructions instead. The separate Swift Admin source and private Unix IPC instructions are in `admin/`. An enrolled identity stays in the operator's Keychain.
