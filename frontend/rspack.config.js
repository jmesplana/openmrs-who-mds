// O3's official shared rspack config. It wires the Module Federation contract the app shell
// expects: `experiments.externalRuntime` takes the federation runtime from the shell's
// `_FEDERATION_RUNTIME_CORE` global instead of embedding a copy, which is what lets the shell
// resolve this remote's `./start` exposes. A hand-rolled ModuleFederationPlugin bundles its own
// runtime, loads without error and mounts nothing.
const config = require('@openmrs/rspack-config');

// The shared config runs every .css file through css-loader with `modules` enabled, which hashes
// class names (`who-mds` -> `-esm-who-mds__styles__who-mds___FOibf`). This module's stylesheet is
// plain global CSS whose rules are already hand-scoped under `.who-mds`, and the components set
// `className` with plain strings, so hashing silently breaks every selector.
//
// `cssRuleConfig` is the config's supported override hook: it is lodash-merged into the CSS rule,
// whose `use` is `[styleLoader, cssLoader]`, so index 1 reaches css-loader's options without
// replacing the loader chain (replacing it feeds css-loader's JS output back to the CSS parser).
config.cssRuleConfig.use = [{}, { options: { modules: false } }];

module.exports = config;
