'use strict';

const TEST_CASE_PROPERTIES_TIMEOUT = 5000;

async function resolveTestCaseProperties(getCasePropertiesFn, tc) {
  if (!getCasePropertiesFn) {
    return null;
  }

  try {
    const result = getCasePropertiesFn(tc);

    if (result && typeof result.then === 'function') {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('testCaseProperties timeout after 5000ms'));
        }, TEST_CASE_PROPERTIES_TIMEOUT);
      });

      return await Promise.race([result, timeoutPromise]);
    }

    return result;
  } catch (err) {
    process.stderr.write(
      `jest-junit: Failed to resolve test case properties for "${tc.title || 'unknown'}": ${err.message}\n`
    );
    return null;
  }
}

module.exports = {
  resolveTestCaseProperties,
  TEST_CASE_PROPERTIES_TIMEOUT,
};
