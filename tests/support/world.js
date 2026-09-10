const { setWorldConstructor, Before, After, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium } = require('@playwright/test');

setDefaultTimeout(30000);

class CSTSWorld {
  constructor({ parameters, attach, log }) {
    this.parameters = parameters;
    this.attach = attach;
    this.log = log;
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

setWorldConstructor(CSTSWorld);

Before(async function () {
  this.browser = await chromium.launch({ headless: true });
  this.context = await this.browser.newContext({
    baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3001'}`,
  });
  this.page = await this.context.newPage();
});

After(async function (scenario) {
  try {
    if (scenario.result?.status === 'FAILED' && this.page) {
      const screenshot = await this.page.screenshot({ fullPage: true });
      if (typeof this.attach === 'function') {
        this.attach(screenshot, 'image/png');
      }
    }
  } catch (err) {
    console.warn(`[world] Screenshot capture failed: ${err.message}`);
  } finally {
    await this.browser?.close();
  }
});
