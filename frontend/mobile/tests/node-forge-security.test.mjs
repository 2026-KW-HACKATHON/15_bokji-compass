import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  constants,
  createHash,
  generateKeyPairSync,
  privateEncrypt,
  sign,
  verify,
} from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
const certificatesPath = cliRequire.resolve("@expo/code-signing-certificates");
const certificatesRequire = createRequire(certificatesPath);
const codeSigning = cliRequire("@expo/code-signing-certificates");
const forge = certificatesRequire("node-forge");

// Ephemeral, local-only keys: malformed DigestInfo signatures below are made
// with our private key to exercise the parser. They are not a demonstration
// of an attacker's ability to forge a signature without that private key.
const nodeKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPEM = nodeKeys.privateKey.export({ type: "pkcs1", format: "pem" });
const publicKeyPEM = nodeKeys.publicKey.export({ type: "spki", format: "pem" });
const keyPair = codeSigning.convertKeyPairPEMToKeyPair({ privateKeyPEM, publicKeyPEM });
const message = Buffer.from("Bokji Compass local RSA verification regression\n", "utf8");
const sha256 = createHash("sha256").update(message).digest();
const sha256Oid = Buffer.from("608648016503040201", "hex");
const emptyNull = Buffer.from([0x05, 0x00]);
const garbage = Buffer.from([0x04, 0x01, 0x42]);

function tlv(tag, content) {
  assert.ok(content.length < 128, "Small regression fixtures use short DER lengths");
  return Buffer.concat([Buffer.from([tag, content.length]), content]);
}

function digestInfo(digest, { oid = sha256Oid, parameters = emptyNull, extra = Buffer.alloc(0) } = {}) {
  const algorithm = tlv(0x30, Buffer.concat([tlv(0x06, oid), parameters, extra]));
  return tlv(0x30, Buffer.concat([algorithm, tlv(0x04, digest)]));
}

function rawSignature(info) {
  // OpenSSL performs the RSA private operation and PKCS#1 type-1 padding;
  // Forge only sees the resulting signature and independently verifies it.
  return privateEncrypt({ key: nodeKeys.privateKey, padding: constants.RSA_PKCS1_PADDING }, info);
}

function forgeVerify(signature, digest = sha256, options) {
  return keyPair.publicKey.verify(digest.toString("latin1"), signature.toString("latin1"), undefined, options);
}

function assertRejected(callback) {
  let accepted = false;
  try {
    accepted = callback();
  } catch (error) {
    assert.ok(error instanceof Error);
  }
  assert.notEqual(accepted, true, "Malformed signature must not verify");
}

test("Expo CLI and certificate verification resolve the same secured Forge", () => {
  assert.equal(cliRequire.resolve("node-forge"), certificatesRequire.resolve("node-forge"));
  assert.equal(require.resolve("node-forge"), certificatesRequire.resolve("node-forge"));
});

for (const algorithm of ["sha1", "sha224", "sha256", "sha384", "sha512"]) {
  test(`canonical RSA PKCS#1 ${algorithm} signatures verify against Node crypto`, () => {
    const digest = createHash(algorithm).update(message).digest();
    const nodeSignature = sign(algorithm, message, nodeKeys.privateKey);
    assert.equal(forgeVerify(nodeSignature, digest), true);
    // Forge accepts SHA-224 DigestInfo but does not ship its digest generator.
    // Exercise signing in both directions for the digests it implements.
    if (algorithm !== "sha224") {
      const md = forge.md[algorithm].create().update(message.toString("latin1"));
      const forgeSignature = Buffer.from(keyPair.privateKey.sign(md), "latin1");
      assert.equal(verify(algorithm, message, nodeKeys.publicKey, forgeSignature), true);
    }
  });

  test(`RSA ${algorithm} retains optional absent NULL parameter compatibility`, () => {
    const digest = createHash(algorithm).update(message).digest();
    const oid = Buffer.from(forge.asn1.oidToDer(forge.oids[algorithm]).getBytes(), "latin1");
    const signature = rawSignature(digestInfo(digest, { oid, parameters: Buffer.alloc(0) }));
    assert.equal(forgeVerify(signature, digest), true);
  });
}

test("RSA-PSS signatures interoperate with Node crypto", () => {
  const nodeOptions = { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 };
  const forgeOptions = () => forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32,
  });
  const nodeSignature = sign("sha256", message, { key: nodeKeys.privateKey, ...nodeOptions });
  assert.equal(keyPair.publicKey.verify(sha256.toString("latin1"), nodeSignature.toString("latin1"), forgeOptions()), true);
  const md = forge.md.sha256.create().update(message.toString("latin1"));
  const forgeSignature = Buffer.from(keyPair.privateKey.sign(md, forgeOptions()), "latin1");
  assert.equal(verify("sha256", message, { key: nodeKeys.publicKey, ...nodeOptions }, forgeSignature), true);
});

test("RSA rejects a wrong digest and a modified signature", () => {
  const signature = sign("sha256", message, nodeKeys.privateKey);
  const wrongMessage = Buffer.concat([message, Buffer.from("changed")]);
  const wrongDigest = createHash("sha256").update(wrongMessage).digest();
  assert.equal(forgeVerify(signature, wrongDigest), false);
  assert.equal(verify("sha256", wrongMessage, nodeKeys.publicKey, signature), false);
  const modifiedSignature = Buffer.from(signature);
  modifiedSignature[modifiedSignature.length - 1] ^= 1;
  assertRejected(() => forgeVerify(modifiedSignature));
  assert.equal(verify("sha256", message, nodeKeys.publicKey, modifiedSignature), false);
});

const canonicalInfo = digestInfo(sha256);
const malformedInfos = [
  ["nested garbage after NULL", digest => digestInfo(digest, { extra: garbage })],
  ["nested garbage without NULL", digest => digestInfo(digest, { parameters: Buffer.alloc(0), extra: garbage })],
  ["duplicate NULL parameters", digest => digestInfo(digest, { extra: emptyNull })],
  ["NULL parameter carrying nonempty bytes", digest => digestInfo(digest, { parameters: Buffer.from([0x05, 0x01, 0x00]) })],
  ["extra outer DigestInfo element", digest => {
    const info = digestInfo(digest);
    return tlv(0x30, Buffer.concat([info.subarray(2), garbage]));
  }],
  ["nonminimal outer DER length", digest => {
    const info = digestInfo(digest);
    return Buffer.concat([Buffer.from([0x30, 0x81, info[1]]), info.subarray(2)]);
  }],
  ["nonminimal nested DER length", digest => {
    const info = digestInfo(digest);
    return tlv(0x30, Buffer.concat([Buffer.from([0x30, 0x81, info[3]]), info.subarray(4)]));
  }],
  ["indefinite BER sequence length", digest => {
    const info = digestInfo(digest);
    return Buffer.concat([Buffer.from([0x30, 0x80]), info.subarray(2), Buffer.from([0x00, 0x00])]);
  }],
  ["overlong OID component", digest => digestInfo(digest, { oid: Buffer.concat([sha256Oid.subarray(0, -1), Buffer.from([0x80, 0x01])]) })],
  ["unterminated OID component", digest => digestInfo(digest, { oid: Buffer.concat([sha256Oid, Buffer.from([0x80])]) })],
];

for (const [name, makeInfo] of malformedInfos) {
  test(`RSA rejects ${name}`, () => {
    const signature = rawSignature(makeInfo(sha256));
    assert.equal(verify("sha256", message, nodeKeys.publicKey, signature), false, "Node crypto rejects the malformed input independently");
    assertRejected(() => forgeVerify(signature));
  });
}

for (const parseAllBytes of [true, false]) {
  test(`RSA rejects trailing DigestInfo bytes with _parseAllDigestBytes=${parseAllBytes}`, () => {
    const signature = rawSignature(Buffer.concat([canonicalInfo, garbage]));
    assert.equal(verify("sha256", message, nodeKeys.publicKey, signature), false);
    assertRejected(() => forgeVerify(signature, sha256, { _parseAllDigestBytes: parseAllBytes }));
  });
}

const now = Date.now();
const certificate = codeSigning.generateSelfSignedCodeSigningCertificate({
  keyPair,
  commonName: "Bokji Compass local regression certificate",
  validityNotBefore: new Date(now - 60_000),
  validityNotAfter: new Date(now + 3_600_000),
});
const certificatePEM = codeSigning.convertCertificateToCertificatePEM(certificate);
function freshCertificate() {
  return codeSigning.convertCertificatePEMToCertificate(certificatePEM);
}

test("Expo self-signed certificate and manifest signing work through actual Forge verification", () => {
  const cert = freshCertificate();
  assert.doesNotThrow(() => codeSigning.validateSelfSignedCertificate(cert, keyPair));
  const signature = Buffer.from(codeSigning.signBufferRSASHA256AndVerify(keyPair.privateKey, cert, message), "base64");
  assert.equal(verify("sha256", message, nodeKeys.publicKey, signature), true);
  assert.equal(forgeVerify(signature), true);
});

for (const [name, makeInfo] of malformedInfos) {
  test(`Expo certificate verification rejects ${name}`, () => {
    const cert = freshCertificate();
    const certificateDigest = Buffer.from(cert.md.digest().getBytes(), "latin1");
    cert.signature = rawSignature(makeInfo(certificateDigest)).toString("latin1");
    assert.throws(() => codeSigning.validateSelfSignedCertificate(cert, keyPair));
  });
}
