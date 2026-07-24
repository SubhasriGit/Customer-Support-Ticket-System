const { setWorldConstructor, Before, After } = require('@cucumber/cucumber');
const { chromium } = require('@playwright/test');

class CSTSWorld {
  constructor({ parameters }) {
    this.parameters = parameters;
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

setWorldConstructor(CSTSWorld);

Before(async function () {
  this.browser = await chromium.launch({ headless: true });
  this.context = await this.browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  this.page = await this.context.newPage();
});

After(async function (scenario) {
  if (scenario.result?.status === 'FAILED' && this.page) {
    const screenshot = await this.page.screenshot({ fullPage: true });
    this.attach(screenshot, 'image/png');
  }
  await this.browser?.close();
});
