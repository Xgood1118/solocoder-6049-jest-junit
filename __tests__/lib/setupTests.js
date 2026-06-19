const xml = require('xml');
const path = require('path');
const fs = require('fs');

let validator;

beforeAll(async () => {
  const { XmlDocument, XsdValidator } = await import('libxml2-wasm');
  const schemaPath = path.join(__dirname, 'junit.xsd');
  const schema = XmlDocument.fromBuffer(fs.readFileSync(schemaPath));
  validator = XsdValidator.fromDoc(schema);

  expect.extend({
    toBeCompliantJUnit(jsonResults) {
      const xmlStr = xml(jsonResults, { indent: '  '});
      const doc = XmlDocument.fromString(xmlStr);

      try {
        validator.validate(doc);

        return {
          message: () => `expected not to validate against junit xsd`,
          pass: true
        }
      } catch (err) {
        return {
          message: () => `${err.message}\n${xmlStr}`,
          pass: false
        }
      }
    }
  });
});
