'use strict';

const path = require('path');
const fs = require('fs');
const constants = require('../constants/index');
const getTestSuitePropertiesPath = require('./getTestSuitePropertiesPath');
const replaceRootDirInOutput = require('./getOptions').replaceRootDirInOutput;
const { resolveTestCaseProperties } = require('./resolveProperties');
const {
  escapeHtml,
  stripAnsiKeepNewlines,
  serializePropertyValue,
  isSerializableForDataAttr,
  buildHtmlTemplate,
} = require('./htmlUtils');

const toTemplateTag = function (varName) {
  return "{" + varName + "}";
};

const testFailureStatus = 'failed';
const testErrorStatus = 'error';

const replaceVars = function (strOrFunc, variables) {
  if (typeof strOrFunc === 'string') {
    let str = strOrFunc;
    Object.keys(variables).forEach((varName) => {
      str = str.replace(toTemplateTag(varName), variables[varName]);
    });
    return str;
  } else {
    const func = strOrFunc;
    const resolvedStr = func(variables);
    if (typeof resolvedStr !== 'string') {
      throw new Error('Template function should return a string');
    }
    return resolvedStr;
  }
};

const executionTime = function (startTime, endTime) {
  return (endTime - startTime) / 1000;
};

const getTestCasePropertiesPath = (options, rootDir = null) => {
  const testCasePropertiesPath = replaceRootDirInOutput(
    rootDir,
    path.join(
      options.testCasePropertiesDirectory,
      options.testCasePropertiesFile,
    ),
  );

  return path.isAbsolute(testCasePropertiesPath)
    ? testCasePropertiesPath
    : path.resolve(testCasePropertiesPath);
};

function getStatus(tc) {
  if (tc.status === testFailureStatus || tc.status === testErrorStatus) {
    return 'failed';
  }
  if (tc.status === 'pending') {
    return 'skipped';
  }
  return 'passed';
}

function buildPropertiesHtml(properties) {
  if (!properties || Object.keys(properties).length === 0) {
    return '';
  }

  const hasComplex = Object.values(properties).some(v => isSerializableForDataAttr(v));

  if (hasComplex) {
    const serialized = {};
    for (const [key, value] of Object.entries(properties)) {
      serialized[key] = isSerializableForDataAttr(value)
        ? serializePropertyValue(value)
        : value;
    }
    const dataAttr = encodeURIComponent(JSON.stringify(serialized));
    return `
      <div class="properties-section">
        <button class="properties-btn" data-json="true" data-properties="${escapeHtml(dataAttr)}">Show properties</button>
        <div class="properties-content"></div>
      </div>`;
  } else {
    let rows = '';
    for (const [key, value] of Object.entries(properties)) {
      rows += `<div class="property-row"><span class="property-name">${escapeHtml(key)}</span><span class="property-value">${escapeHtml(String(value))}</span></div>`;
    }
    return `
      <div class="properties-section">
        <button class="properties-btn">Show properties</button>
        <div class="properties-content">${rows}</div>
      </div>`;
  }
}

async function buildTestCaseHtml(junitOptions, suiteOptions, tc, filepath, filename, suiteTitle, displayName, getCasePropertiesFn) {
  const classname = tc.ancestorTitles.join(suiteOptions.ancestorSeparator);
  const testTitle = tc.title;
  const status = getStatus(tc);

  let testVariables = {};
  testVariables[constants.FILEPATH_VAR] = filepath;
  testVariables[constants.FILENAME_VAR] = filename;
  testVariables[constants.SUITENAME_VAR] = suiteTitle;
  testVariables[constants.CLASSNAME_VAR] = classname;
  testVariables[constants.TITLE_VAR] = testTitle;
  testVariables[constants.DISPLAY_NAME_VAR] = displayName;

  const displayClassname = escapeHtml(replaceVars(suiteOptions.classNameTemplate, testVariables));
  const displayTitle = escapeHtml(replaceVars(suiteOptions.titleTemplate, testVariables));
  const time = (tc.duration / 1000).toFixed(3);

  let failureDetailsHtml = '';
  if (status === 'failed') {
    const failureMessages = junitOptions.noStackTrace === 'true' && tc.failureDetails
      ? tc.failureDetails.map(detail => detail.message)
      : tc.failureMessages;

    if (failureMessages && failureMessages.length > 0) {
      const messagesHtml = failureMessages
        .map(msg => `<pre>${escapeHtml(stripAnsiKeepNewlines(msg))}</pre>`)
        .join('');
      const count = failureMessages.length > 1 ? ` (${failureMessages.length})` : '';
      failureDetailsHtml = `<details class="failure-details" open><summary>Failure details${count}</summary>${messagesHtml}</details>`;
    }
  }

  const caseProperties = await resolveTestCaseProperties(getCasePropertiesFn, tc);
  const propertiesHtml = caseProperties ? buildPropertiesHtml(caseProperties) : '';

  return `
    <div class="testcase ${status}">
      <div class="testcase-info">
        <div class="testcase-classname">${displayClassname}</div>
        <div class="testcase-title">${displayTitle}</div>
        ${failureDetailsHtml}
        ${propertiesHtml}
      </div>
      <div class="testcase-meta">
        <span class="badge ${status}">${status}</span>
        <span class="testcase-time">${time}s</span>
      </div>
    </div>`;
}

const addErrorTestResult = function (suite) {
  suite.testResults.push({
    "ancestorTitles": [],
    "duration": 0,
    "failureMessages": [
      suite.failureMessage
    ],
    "numPassingAsserts": 0,
    "status": testErrorStatus
  });
};

function applySuiteNameLogic(options) {
  const isExplicitlySet = options._isExplicitlySet || (() => false);

  const suiteNameTemplateExplicit = isExplicitlySet('suiteNameTemplate');
  const usePathForSuiteNameTrue = options.usePathForSuiteName === 'true';

  if (usePathForSuiteNameTrue && !suiteNameTemplateExplicit) {
    options.suiteNameTemplate = toTemplateTag(constants.FILEPATH_VAR);
  }
}

module.exports = async function (report, appDirectory, options, rootDir = null) {
  applySuiteNameLogic(options);

  const junitSuitePropertiesFilePath = getTestSuitePropertiesPath(
    options,
    rootDir,
  );
  let ignoreSuitePropertiesCheck = !fs.existsSync(junitSuitePropertiesFilePath);

  const testCasePropertiesPath = getTestCasePropertiesPath(options, rootDir);
  const getTestCaseProperties = fs.existsSync(testCasePropertiesPath) ? require(testCasePropertiesPath) : null;

  const totalTests = report.testResults.reduce((sum, suite) => {
    return sum + suite.numFailingTests + suite.numPassingTests + suite.numPendingTests;
  }, 0);
  const totalFailed = report.testResults.reduce((sum, suite) => sum + suite.numFailingTests, 0);
  const totalSkipped = report.testResults.reduce((sum, suite) => sum + suite.numPendingTests, 0);
  const totalErrors = report.testResults.reduce((sum, suite) => {
    return sum + (suite.testResults.length === 0 && options.reportTestSuiteErrors !== 'false' ? 1 : 0);
  }, 0);
  const totalPassed = totalTests - totalFailed - totalSkipped;

  const summary = {
    tests: totalTests,
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
    errors: totalErrors,
    time: executionTime(report.startTime, Date.now()),
  };

  let suitesHtml = '';

  for (const suite of report.testResults) {
    const noResults = suite.testResults.length === 0;
    if (noResults && options.reportTestSuiteErrors === 'false') {
      continue;
    }

    const noResultOptions = noResults ? {
      suiteNameTemplate: toTemplateTag(constants.FILEPATH_VAR),
      titleTemplate: toTemplateTag(constants.FILEPATH_VAR),
      classNameTemplate: `Test suite failed to run`
    } : {};

    const suiteOptions = Object.assign({}, options, noResultOptions);
    if (noResults) {
      addErrorTestResult(suite);
    }

    const filepath = path.join(suiteOptions.filePathPrefix, path.relative(appDirectory, suite.testFilePath));
    const filename = path.basename(filepath);
    const suiteTitle = suite.testResults[0].ancestorTitles[0];
    const displayName = typeof suite.displayName === 'object'
      ? suite.displayName.name
      : suite.displayName;

    let suiteNameVariables = {};
    suiteNameVariables[constants.FILEPATH_VAR] = filepath;
    suiteNameVariables[constants.FILENAME_VAR] = filename;
    suiteNameVariables[constants.TITLE_VAR] = suiteTitle;
    suiteNameVariables[constants.DISPLAY_NAME_VAR] = displayName;

    const suiteName = escapeHtml(replaceVars(suiteOptions.suiteNameTemplate, suiteNameVariables));
    const suiteNumTests = suite.numFailingTests + suite.numPassingTests + suite.numPendingTests;
    const suiteTime = executionTime(suite.perfStats.start, suite.perfStats.end);
    const suitePassed = suite.numPassingTests;
    const suiteFailed = suite.numFailingTests;
    const suiteSkipped = suite.numPendingTests;

    let testCasesHtml = '';
    for (const tc of suite.testResults) {
      testCasesHtml += await buildTestCaseHtml(
        options,
        suiteOptions,
        tc,
        filepath,
        filename,
        suiteTitle,
        displayName,
        getTestCaseProperties
      );
    }

    if (suite.testExecError != null) {
      const fakeTC = {
        status: testFailureStatus,
        failureMessages: [JSON.stringify(suite.testExecError)],
        classname: undefined,
        title: "Test execution failure: could be caused by test hooks like 'afterAll'.",
        ancestorTitles: [""],
        duration: 0,
        invocations: 1,
      };
      testCasesHtml += await buildTestCaseHtml(
        options,
        suiteOptions,
        fakeTC,
        filepath,
        filename,
        suiteTitle,
        displayName,
        getTestCaseProperties
      );
    }

    let consoleHtml = '';
    if (suiteOptions.includeConsoleOutput === 'true' && suite.console && suite.console.length) {
      const consoleJson = JSON.stringify(suite.console, null, 2);
      consoleHtml = `
        <div class="system-out">
          <details>
            <summary>Console Output</summary>
            <pre>${escapeHtml(consoleJson)}</pre>
          </details>
        </div>`;
    }

    if (suiteOptions.includeShortConsoleOutput === 'true' && suite.console && suite.console.length) {
      const messagesJson = JSON.stringify(suite.console.map(item => item.message), null, 2);
      consoleHtml = `
        <div class="system-out">
          <details>
            <summary>Console Output</summary>
            <pre>${escapeHtml(messagesJson)}</pre>
          </details>
        </div>`;
    }

    const hasFailed = suiteFailed > 0 || (suite.testExecError != null);
    const suiteClass = hasFailed ? 'suite open' : 'suite';

    suitesHtml += `
      <div class="${suiteClass}">
        <div class="suite-header">
          <div class="suite-name"><span class="toggle-icon">▶</span>${suiteName}</div>
          <div class="suite-stats">
            <span class="passed">${suitePassed} passed</span>
            <span class="failed">${suiteFailed} failed</span>
            <span class="skipped">${suiteSkipped} skipped</span>
            <span class="time">${suiteTime.toFixed(3)}s</span>
          </div>
        </div>
        <div class="suite-body">
          ${testCasesHtml}
          ${consoleHtml}
        </div>
      </div>`;
  }

  return buildHtmlTemplate(suitesHtml, summary);
};
