const QUALITY_CHECKS = {
  analysis:      (output) => !!(output.epics?.length && output.stories?.length),
  plan:          (output) => !!(output.plan?.phases?.length),
  design:        (output) => !!(output.architecture && output.hld && output.lld),
  development:   (output) => !!(output.prUrl),
  documentation: (output) => !!(output.confluenceUrl && output.readmePath),
  build:         (output) => !!(output.artifactPath),
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
