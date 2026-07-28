module.exports = {
  default: {
    features: ['features/**/*.feature'],
    require: ['support/**/*.js', 'steps/**/*.steps.js'],
    format: [
      'progress',
      'json:cucumber-report/report.json',
      'html:cucumber-report/report.html',
    ],
    publishQuiet: true,
    timeout: 30000,
  },
};
