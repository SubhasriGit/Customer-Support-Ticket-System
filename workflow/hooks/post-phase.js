const QUALITY_CHECKS = {
  requirement_analysis: (output) => !!(output.epics?.length && output.stories?.length),
  app_analysis:         (output) => !!(output.epics?.length && output.stories?.length),
  design:               (output) => !!(output.architecture && output.hld && output.lld),
  development:          (output) => !!(output.prUrl),
  testing:              (output) => output.exitCode === 0,
  deployment:           (output) => !!(output.artifactPath),
  maintenance:          (output) => !!(output.confPageId),
};

async function postPhaseHook(phaseName, output) {
  const check = QUALITY_CHECKS[phaseName];

  if (!check) {
    console.log(`[post-phase:${phaseName}] No quality check defined, passing.`);
    return { passed: true, output };
  }

  const passed = check(output);

  if (!passed) {
    console.warn(`[post-phase:${phaseName}] Quality check FAILED. Output incomplete.`);
    return { passed: false, reason: `Output for phase "${phaseName}" is missing required fields.`, output };
  }

  console.log(`[post-phase:${phaseName}] Quality check passed.`);
  return { passed: true, output };
}

module.exports = { postPhaseHook };
