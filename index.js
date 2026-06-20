'use strict';

const xml = require('xml');
const { mkdir } = require('node:fs/promises');
const fs = require('fs');
const path = require('path');

const buildJsonResults = require('./utils/buildJsonResults');
const buildHtmlResults = require('./utils/buildHtmlResults');
const getOptions = require('./utils/getOptions');
const getOutputPath = require('./utils/getOutputPath');
const { getOutputPathForFormat, getOutputFormats } = require('./utils/getOutputPath');

const consoleBuffer = {};

function handleFileError(error, filePath, operation) {
  if (error.code === 'ENOENT') {
    process.stderr.write(
      `jest-junit: ${operation} failed: file not found at ${filePath} (ENOENT)\n`
    );
  } else if (error.code === 'EACCES') {
    process.stderr.write(
      `jest-junit: ${operation} failed: permission denied at ${filePath} (EACCES)\n`
    );
  } else {
    process.stderr.write(
      `jest-junit: ${operation} failed at ${filePath}: ${error.message}\n`
    );
  }
}

async function ensureDir(dirPath, dryRun) {
  if (dryRun) {
    return;
  }
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    handleFileError(err, dirPath, 'mkdir');
  }
}

function writeFileSafe(filePath, content, dryRun) {
  if (dryRun) {
    process.stderr.write(`jest-junit: dry run - would write ${filePath}\n`);
    return;
  }
  try {
    fs.writeFileSync(filePath, content);
  } catch (err) {
    handleFileError(err, filePath, 'write');
  }
}

const processor = async (report, reporterOptions = {}, jestRootDir = null) => {
  const options = getOptions.options(reporterOptions);

  report.testResults.forEach((t, i) => {
    t.console = consoleBuffer[t.testFilePath];
  });

  const appDirectory = fs.realpathSync(process.cwd());
  const formats = getOutputFormats(options);
  const dryRun = options._dryRun || options.dryRun === 'true';

  let jsonResults = null;
  let htmlResults = null;

  if (formats.includes('junit')) {
    jsonResults = await buildJsonResults(
      report,
      appDirectory,
      options,
      jestRootDir
    );
  }

  if (formats.includes('html')) {
    htmlResults = await buildHtmlResults(
      report,
      appDirectory,
      options,
      jestRootDir
    );
  }

  let dirCreated = false;

  for (const format of formats) {
    const outputPath = await getOutputPathForFormat(options, jestRootDir, format);

    if (!dirCreated) {
      await ensureDir(path.dirname(outputPath), dryRun);
      dirCreated = true;
    }

    if (format === 'junit' && jsonResults) {
      const xmlContent = xml(jsonResults, { indent: '  ', declaration: true });
      writeFileSafe(outputPath, xmlContent, dryRun);
    } else if (format === 'html' && htmlResults) {
      writeFileSafe(outputPath, htmlResults, dryRun);
    }
  }

  return report;
};

function JestJUnit (globalConfig, options) {
  if (globalConfig.hasOwnProperty('testResults')) {
    const newConfig = JSON.stringify({
      reporters: ['jest-junit']
    }, null, 2);

    return processor(globalConfig);
  }

  this._globalConfig = globalConfig;
  this._options = options;

  this.onTestResult = (test, testResult, aggregatedResult) => {
    if (testResult.console && testResult.console.length > 0) {
      consoleBuffer[testResult.testFilePath] = testResult.console;
    }
  };

  this.onRunComplete = async (contexts, results) => {
    await processor(results, this._options, this._globalConfig.rootDir);
  };
}

module.exports = JestJUnit;
