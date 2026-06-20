'use strict';

const stripAnsi = require('strip-ansi');
const constants = require('../constants/index');
const path = require('path');
const fs = require('fs');
const getTestSuitePropertiesPath = require('./getTestSuitePropertiesPath');
const replaceRootDirInOutput = require('./getOptions').replaceRootDirInOutput;
const { resolveTestCaseProperties } = require('./resolveProperties');

const toTemplateTag = function (varName) {
  return "{" + varName + "}";
}

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
}

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

const generateTestCase = function(junitOptions, suiteOptions, tc, filepath, filename, suiteTitle, displayName, junitCaseProperties){
  const classname = tc.ancestorTitles.join(suiteOptions.ancestorSeparator);
  const testTitle = tc.title;

  let testVariables = {};
  testVariables[constants.FILEPATH_VAR] = filepath;
  testVariables[constants.FILENAME_VAR] = filename;
  testVariables[constants.SUITENAME_VAR] = suiteTitle;
  testVariables[constants.CLASSNAME_VAR] = classname;
  testVariables[constants.TITLE_VAR] = testTitle;
  testVariables[constants.DISPLAY_NAME_VAR] = displayName;

  let testCase = {
    'testcase': [{
      _attr: {
        classname: replaceVars(suiteOptions.classNameTemplate, testVariables),
        name: replaceVars(suiteOptions.titleTemplate, testVariables),
        time: tc.duration / 1000
      }
    }]
  };

  if (suiteOptions.addFileAttribute === 'true') {
    testCase.testcase[0]._attr.file = filepath;
  }

  if (tc.status === testFailureStatus || tc.status === testErrorStatus) {
    const failureMessages = junitOptions.noStackTrace === 'true' && tc.failureDetails ?
        tc.failureDetails.map(detail => detail.message) : tc.failureMessages;

    failureMessages.forEach((failure) => {
      const tagName = tc.status === testFailureStatus ? 'failure': testErrorStatus
      testCase.testcase.push({
        [tagName]: strip(failure)
      });
    })
  }

  if (tc.status === 'pending') {
    testCase.testcase.push({
      skipped: {}
    });
  }

  if (junitCaseProperties !== null) {
    let testCasePropertyMain = {
      'properties': []
    };

    Object.keys(junitCaseProperties).forEach((p) => {
      let testSuiteProperty = {
        'property': {
          _attr: {
            name: p,
            value: junitCaseProperties[p]
          }
        }
      };

      testCasePropertyMain.properties.push(testSuiteProperty);
    });

    testCase.testcase.push(testCasePropertyMain);
  }

  return testCase;
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
  })
}

const strip = function (str) {
  return stripAnsi(str).replace(/\u001b/g, '');
}

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

  const testCasePropertiesPath = getTestCasePropertiesPath(options, rootDir)
  const getTestCaseProperties = fs.existsSync(testCasePropertiesPath) ? require(testCasePropertiesPath) : null

  let jsonResults = {
    'testsuites': [{
      '_attr': {
        'name': options.suiteName,
        'tests': 0,
        'failures': 0,
        'errors': 0,
        'time': executionTime(report.startTime, Date.now())
      }
    }]
  };

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

    const suiteNumTests = suite.numFailingTests + suite.numPassingTests + suite.numPendingTests;
    const suiteExecutionTime = executionTime(suite.perfStats.start, suite.perfStats.end);

    const suiteErrors = noResults ? 1 : 0;
    let testSuite = {
      'testsuite': [{
        _attr: {
          name: replaceVars(suiteOptions.suiteNameTemplate, suiteNameVariables),
          errors: suiteErrors,
          failures: suite.numFailingTests,
          skipped: suite.numPendingTests,
          timestamp: (new Date(suite.perfStats.start)).toISOString().slice(0, -5),
          time: suiteExecutionTime,
          tests: suiteNumTests
        }
      }]
    };

    jsonResults.testsuites[0]._attr.failures += suite.numFailingTests;
    jsonResults.testsuites[0]._attr.errors += suiteErrors;
    jsonResults.testsuites[0]._attr.tests += suiteNumTests;

    if (!ignoreSuitePropertiesCheck) {
      let junitSuiteProperties = require(junitSuitePropertiesFilePath)(suite);

      let testSuitePropertyMain = {
        'properties': []
      };

      Object.keys(junitSuiteProperties).forEach((p) => {
        let testSuiteProperty = {
          'property': {
            _attr: {
              name: p,
              value: replaceVars(junitSuiteProperties[p], suiteNameVariables)
            }
          }
        };

        testSuitePropertyMain.properties.push(testSuiteProperty);
      });

      testSuite.testsuite.push(testSuitePropertyMain);
    }

    for (const tc of suite.testResults) {
      const caseProperties = await resolveTestCaseProperties(getTestCaseProperties, tc);
      const testCase = generateTestCase(
        options,
        suiteOptions,
        tc,
        filepath,
        filename,
        suiteTitle,
        displayName,
        caseProperties
      );
      testSuite.testsuite.push(testCase);
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
      const caseProperties = await resolveTestCaseProperties(getTestCaseProperties, fakeTC);
      const testCase = generateTestCase(
        options,
        suiteOptions,
        fakeTC,
        filepath,
        filename,
        suiteTitle,
        displayName,
        caseProperties
      );
      testSuite.testsuite.push(testCase);
    }

    if (suiteOptions.includeConsoleOutput === 'true' && suite.console && suite.console.length) {
      let testSuiteConsole = {
        'system-out': {
          _cdata: JSON.stringify(suite.console, null, 2)
        }
      };

      testSuite.testsuite.push(testSuiteConsole);
    }

    if (suiteOptions.includeShortConsoleOutput === 'true' && suite.console && suite.console.length) {
      let testSuiteConsole = {
        'system-out': {
          _cdata: JSON.stringify(suite.console.map(item => item.message), null, 2)
        }
      };

      testSuite.testsuite.push(testSuiteConsole);
    }

    jsonResults.testsuites.push(testSuite);
  }

  return jsonResults;
};
