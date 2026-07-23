const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 3000, 7000];

async function onFailureHook(phaseName, error, retryCount, retryFn) {
  if (retryCount >= MAX_RETRIES) {
    console.error(`[on-failure:${phaseName}] Max retries (${MAX_RETRIES}) reached. Escalating to HITL.`);
    return { escalate: true, reason: error.message };
  }

  const delay = BACKOFF_MS[retryCount] || 7000;
  console.warn(
    `[on-failure:${phaseName}] Attempt ${retryCount + 1}/${MAX_RETRIES} failed: ${error.message}. ` +
    `Retrying in ${delay}ms...`
  );

  await new Promise(r => setTimeout(r, delay));

  try {
    const result = await retryFn();
    console.log(`[on-failure:${phaseName}] Retry ${retryCount + 1} succeeded.`);
    return { escalate: false, result };
  } catch (retryError) {
    return onFailureHook(phaseName, retryError, retryCount + 1, retryFn);
  }
}

module.exports = { onFailureHook, MAX_RETRIES };
