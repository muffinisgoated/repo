# Windows setup

Use WSL2 with a Linux distribution. Install Node.js 24.22.3 inside WSL and extract the project to the Linux filesystem. Run the verification, dependency and build commands in [Start here](START_HERE.md) from the WSL terminal. Run `npm start` and open `http://127.0.0.1:8800/` from the browser when WSL localhost forwarding is available.

Relay approval and private server state rely on Unix sockets and POSIX permissions. The native Admin application requires macOS. Local isolated HTTPS also requires a resolver and test CA usable by the browser actually opening the site. A Windows/WSL2 live run was outside handoff verification.
