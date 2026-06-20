'use strict';

const path = require('path');
const fs = require('fs');

const constants = require('../constants/index');

const { replaceRootDirInPath } = require('./replaceRootDirInPath');

let uuidV1Promise;
function loadUuidV1() {
  if (!uuidV1Promise) {
    uuidV1Promise = import('uuid').then((mod) => mod.v1);
  }
  return uuidV1Promise;
}

function getEnvOptions() {
  const options = {};

  for (let name in constants.ENVIRONMENT_CONFIG_MAP) {
    if (process.env[name]) {
      options[constants.ENVIRONMENT_CONFIG_MAP[name]] = process.env[name];
    }
  }

  return options;
}

function getAppOptions(pathToResolve) {
  let traversing = true;

  const rootDir = path.parse(pathToResolve).root

  while(traversing) {
    traversing = pathToResolve !== rootDir;

    const pkgpath = path.join(pathToResolve, 'package.json');

    if (fs.existsSync(pkgpath)) {
      let options;

      try {
        options = (require(pkgpath) || {})['jest-junit'];
      } catch (error) {
        console.warn(`Unable to import package.json to get app Options : ${error}`)
      }

      if (Object.prototype.toString.call(options) !== '[object Object]') {
        options = {};
      }

      return options;
    } else {
      pathToResolve = path.dirname(pathToResolve);
    }
  }

  return {};
}

function replaceRootDirInOutput(rootDir, output) {
  return rootDir !== null ? replaceRootDirInPath(rootDir, output) : output;
}

async function getUniqueOutputName(outputName) {
  const v1 = await loadUuidV1();
  const outputPrefix = outputName ? outputName : 'junit'
  return `${outputPrefix}-${v1()}.xml`
}

function getUniqueOutputNameForFormat(outputName, format) {
  const baseName = outputName.replace(/\.[^.]+$/, '');
  const ext = format === 'html' ? 'html' : 'xml';
  return `${baseName}.${ext}`;
}

function mergeOptionsWithSources(reporterOptions, appOptions, envOptions) {
  const sources = {
    defaults: Object.keys(constants.DEFAULT_OPTIONS),
    reporter: Object.keys(reporterOptions),
    packageJson: Object.keys(appOptions),
    env: Object.keys(envOptions),
  };

  const effective = Object.assign({}, constants.DEFAULT_OPTIONS, reporterOptions, appOptions, envOptions);

  const sourceMap = {};
  for (const key of Object.keys(effective)) {
    if (envOptions.hasOwnProperty(key)) {
      sourceMap[key] = 'env';
    } else if (appOptions.hasOwnProperty(key)) {
      sourceMap[key] = 'package.json';
    } else if (reporterOptions.hasOwnProperty(key)) {
      sourceMap[key] = 'reporter options';
    } else {
      sourceMap[key] = 'default';
    }
  }

  const explicitlySet = {
    reporter: new Set(Object.keys(reporterOptions)),
    packageJson: new Set(Object.keys(appOptions)),
    env: new Set(Object.keys(envOptions)),
  };

  const isExplicitlySet = (key) => {
    return explicitlySet.reporter.has(key) ||
           explicitlySet.packageJson.has(key) ||
           explicitlySet.env.has(key);
  };

  return { effective, sourceMap, isExplicitlySet, sources };
}

function printEffectiveConfig(effective, sourceMap) {
  const lines = ['jest-junit effective config (dry run):'];
  const keys = Object.keys(effective)
    .filter(key => !key.startsWith('_'))
    .sort();
  for (const key of keys) {
    const source = sourceMap[key] || 'unknown';
    const value = effective[key];
    const displayValue = typeof value === 'string' ? value : JSON.stringify(value);
    lines.push(`  ${key} = ${displayValue}  (source: ${source})`);
  }
  process.stderr.write(lines.join('\n') + '\n');
}

module.exports = {
  options: (reporterOptions = {}) => {
    const appOptions = getAppOptions(process.cwd());
    const envOptions = getEnvOptions();
    const { effective, sourceMap, isExplicitlySet } = mergeOptionsWithSources(
      reporterOptions,
      appOptions,
      envOptions
    );

    effective._sourceMap = sourceMap;
    effective._isExplicitlySet = isExplicitlySet;
    effective._dryRun = effective.dryRun === 'true';

    if (effective._dryRun) {
      printEffectiveConfig(effective, sourceMap);
    }

    return effective;
  },
  getAppOptions: getAppOptions,
  getEnvOptions: getEnvOptions,
  replaceRootDirInOutput: replaceRootDirInOutput,
  getUniqueOutputName: getUniqueOutputName,
  getUniqueOutputNameForFormat: getUniqueOutputNameForFormat,
  mergeOptionsWithSources: mergeOptionsWithSources,
  printEffectiveConfig: printEffectiveConfig,
};
