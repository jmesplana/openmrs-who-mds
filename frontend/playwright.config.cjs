const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', workers: 1,
  use: { headless: true, launchOptions: process.env.WHO_MDS_CHROMIUM ? { executablePath: process.env.WHO_MDS_CHROMIUM } : {} }
});
