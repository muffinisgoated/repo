# Linux hosting setup

Use a private Linux VM or service host with Node.js 24.22.3, a dedicated unprivileged service user and writable private volumes. Follow [Start here](START_HERE.md) to verify and build. Review [Production HTTPS](docs/PRODUCTION-HTTPS.md) before enabling ingress.

Copy the non-secret variable names in `config-examples/production.env.example` into the service environment and replace the example values. Mount the TLS chain, private key and access token as separate operator-controlled files. Run `npm run start:production` under the service supervisor. The command starts one TLS listener. The production process uses direct TLS or layer-4 TCP passthrough with intact SNI and Host. Confirm the listener port matches the advertised port. Keep the standard loopback preview and private Admin off public ingress.

Use one process per authority set. Active workspace routes and WSS grants are process-local. Do the target-host checks in [Security and privacy](SECURITY_AND_PRIVACY.md) before allowing broader access. No cloud provider was configured or tested during export.
