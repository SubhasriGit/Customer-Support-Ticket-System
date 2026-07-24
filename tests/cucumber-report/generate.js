const reporter = require('multiple-cucumber-html-reporter');
const path = require('path');

reporter.generate({
  jsonDir: path.join(__dirname),
  reportPath: path.join(__dirname, 'html'),
  metadata: {
    browser: { name: 'chrome', version: 'latest' },
    device: 'Desktop',
    platform: { name: 'Windows', version: '11' },
  },
  customData: {
    title: 'Test Run Info',
    data: [
      { label: 'Project',  value: 'Customer Support Ticket System' },
      { label: 'Release',  value: '1.0.0' },
      { label: 'Cycle',    value: 'SDLC Pipeline — QA Phase' },
      { label: 'Team',     value: 'mm-learning-group-1' },
    ],
  },
});

console.log('[cucumber-report] HTML report generated at: cucumber-report/html/index.html');
