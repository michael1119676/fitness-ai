const path = require("path");
const { root } = require("./register-typescript.cjs");

require(path.join(root, "src/lib/__tests__/core-scenarios.test.ts"));
