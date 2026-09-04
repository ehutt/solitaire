const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("native and web configuration agree on app identity and device support", () => {
  const capacitor = JSON.parse(read("capacitor.config.json"));
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const info = read("ios/App/App/Info.plist");

  assert.match(project, new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${capacitor.appId.replaceAll(".", "\\.")};`, "g"));
  assert.match(info, new RegExp(`<key>CFBundleDisplayName</key>\\s*<string>${capacitor.appName}</string>`));
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2";/);
  assert.match(info, /UISupportedInterfaceOrientations~ipad/);
  assert.match(info, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
});

test("the app privacy declaration is bundled and declares no collection", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const privacy = read("ios/App/App/PrivacyInfo.xcprivacy");

  assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(privacy, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array>\s*<\/array>/);
  assert.match(privacy, /<key>NSPrivacyAccessedAPITypes<\/key>\s*<array>\s*<\/array>/);
});

test("CI enforces Apple's current submission SDK and a reproducible Capacitor sync", () => {
  const workflow = read(".github/workflows/ios.yml");
  assert.match(workflow, /show-sdk-version[^]*-ge 26/);
  assert.ok(workflow.indexOf("npx cap sync ios") < workflow.indexOf("xcodebuild\n"));
  assert.match(workflow, /git diff --exit-code --[^\n]*ios\/App\/CapApp-SPM\/Package\.swift/);
});

test("fork pull requests run without trusted credentials or write permission", () => {
  const workflows = `${read(".github/workflows/ci.yml")}\n${read(".github/workflows/ios.yml")}`;
  assert.match(workflows, /permissions:\s*contents: read/g);
  assert.doesNotMatch(workflows, /pull_request_target|\bsecrets\./);
  assert.equal(read(".github/CODEOWNERS").trim(), "* @ehutt");
});
