# Build and packaging

## What a build produces

`npm run build` runs `tauri build`, which:

1. builds the frontend with Vite into `dist/`;
2. compiles the Rust binary in release mode;
3. packages the two Windows installers declared in `src-tauri/tauri.conf.json`.

```
src-tauri/target/release/
├─ llamadesk.exe                              the application
└─ bundle/
   ├─ nsis/LlamaDesk_<version>_x64-setup.exe  per-user installer, no admin rights
   └─ msi/LlamaDesk_<version>_x64_en-US.msi   MSI package
```

The NSIS installer shows a language selector (English, Italian) and installs for the current
user. No updater artifacts are produced: `createUpdaterArtifacts` is `false`, because the app
never contacts the network.

## Requirements

The same as for development ([DEVELOPMENT.md](DEVELOPMENT.md)): Node.js 20+, the Rust stable
toolchain and the MSVC 2022 build tools. The first release build takes several minutes because
the whole Rust dependency tree is compiled with optimisations.

## Building locally

```bash
npm install
npm run build
```

Useful variations:

```bash
npm run build -- --target x86_64-pc-windows-msvc   # the target CI uses
npm run build -- --bundles nsis                    # only the .exe installer
npm run build:vite                                 # only the frontend, into dist/
```

## What is inside the binary

- **SQLite** is compiled into the executable (`rusqlite` with the `bundled` feature): no DLL and
  no database server on the user's machine.
- **Translations and icons** are part of the bundle; nothing is downloaded at runtime.
- **The icon set** comes from `src/components/brand/geometry.json`. Regenerate it with
  `npm run icons`, which draws `src-tauri/icons/source.png`, runs `tauri icon` for the whole set,
  and then writes a custom `icon.ico` whose 16–32 px entries use the simplified symbol.

## Release profile

`src-tauri/Cargo.toml` optimises for size and startup: `codegen-units = 1`, `lto = true`,
`opt-level = "s"`, `panic = "abort"`, `strip = true`. Argon2 and Blake2 are compiled with
optimisations even in debug builds, otherwise verifying a password would take seconds while
developing.

## Signing

The installers are **not signed**. Windows SmartScreen will warn users until a code-signing
certificate is configured (`bundle.windows.certificateThumbprint` plus the certificate in the
repository secrets). Until then, releases publish SHA-256 checksums and the build is reproducible
from the public workflow.

## Publishing

Building locally is enough to try the installer. Public releases are produced by the GitHub
workflow described in [RELEASE.md](RELEASE.md).
