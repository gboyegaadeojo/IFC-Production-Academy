// One-time setup for device alerts (docs/runbooks/push-alerts.md): makes a VAPID key pair and
// stores it with the GitHub CLI, the public key as the variable VAPID_PUBLIC_KEY and the private
// key as the secret VAPID_PRIVATE_KEY. The private key goes straight from memory to `gh` and is
// never printed or written to disk. Run once, then deploy: `npm run push:keys`.
//
// Running it again makes new keys, which turns alerts off on every device until people turn them
// on again. It asks before replacing keys that already exist.
import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

function gh(args, input) {
  const result = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed`);
  }
  return result.stdout;
}

const existing = execFileSync("gh", ["variable", "list"], { encoding: "utf8" });
if (/^VAPID_PUBLIC_KEY\b/m.test(existing)) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "Alert keys already exist. New keys turn alerts off on every device. Replace them? (yes/no) ",
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Kept the existing keys.");
    process.exit(0);
  }
}

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString(
  "base64url",
);

gh(["variable", "set", "VAPID_PUBLIC_KEY"], publicKey);
gh(["secret", "set", "VAPID_PRIVATE_KEY"], jwk.d);
console.log("Saved VAPID_PUBLIC_KEY (variable) and VAPID_PRIVATE_KEY (secret) in GitHub.");
console.log(
  "Next: run the Deploy workflow (or push to main) so the app and database pick them up.",
);
