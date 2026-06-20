const path = require('path');
const getOptions = require('./getOptions');

function replaceExtension(filePath, format) {
  const ext = format === 'html' ? '.html' : '.xml';
  return filePath.replace(/\.[^.]+$/, ext);
}

async function getBaseOutputPath(options, jestRootDir) {
  let output = options.outputFile;
  if (!output) {
    const outputName = (options.uniqueOutputName === 'true')
      ? await getOptions.getUniqueOutputName(options.outputName)
      : options.outputName;
    output = getOptions.replaceRootDirInOutput(jestRootDir, options.outputDirectory);
    return path.join(output, outputName);
  }

  return getOptions.replaceRootDirInOutput(jestRootDir, output);
}

async function getOutputPathForFormat(options, jestRootDir, format) {
  const basePath = await getBaseOutputPath(options, jestRootDir);
  return replaceExtension(basePath, format);
}

function getOutputFormats(options) {
  const format = options.outputFormat;
  if (Array.isArray(format)) {
    return format;
  }
  if (typeof format === 'string') {
    return [format];
  }
  return ['junit'];
}

module.exports = async (options, jestRootDir) => {
  return getOutputPathForFormat(options, jestRootDir, 'junit');
};

module.exports.getOutputPathForFormat = getOutputPathForFormat;
module.exports.getOutputFormats = getOutputFormats;
module.exports.replaceExtension = replaceExtension;
