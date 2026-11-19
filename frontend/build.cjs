const rspack = require('@rspack/core');
// The shared config is an ES module whose default export is a factory taking (env, argv).
const configFactory = require('./rspack.config');
const config = (configFactory.default ?? configFactory)({}, { mode: 'production' });
const compiler = rspack(config);
compiler.run((error, stats) => {
  if (error) { console.error(error); process.exitCode = 1; }
  else { console.log(stats.toString({ colors: false, modules: false })); if (stats.hasErrors()) process.exitCode = 1; }
  compiler.close(error => { if (error) { console.error(error); process.exitCode = 1; } });
});
