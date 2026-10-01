// query-string 7 expects a CommonJS function; the upstream security fix is ESM.
// Keep the decoding algorithm in the unmodified upstream patched dependency.
module.exports = require("decode-uri-component-patched").default;
