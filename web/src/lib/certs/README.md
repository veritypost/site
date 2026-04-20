# Vendored certs

## `apple-root-ca-g3.der`

Apple Root CA — G3. Root of trust for StoreKit 2 signed transactions (JWS) and App Store Server Notifications V2.

This file is **not** checked in. Populate once per deployment.

### Fetch

```sh
curl -o web/src/lib/certs/apple-root-ca-g3.der \
  https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
```

### Verify

Apple publishes fingerprints at <https://www.apple.com/certificateauthority/>. After download:

```sh
openssl x509 -in web/src/lib/certs/apple-root-ca-g3.der -inform der -noout -fingerprint -sha256
```

Compare the output to Apple's published SHA-256 fingerprint for Apple Root CA — G3.

### Alternative

If you cannot write to the filesystem in your deployment environment (some serverless runtimes), set the env var `APPLE_ROOT_CA_DER_BASE64` to the base64-encoded DER bytes of the same cert. The loader checks the env var first, then falls back to the file.
