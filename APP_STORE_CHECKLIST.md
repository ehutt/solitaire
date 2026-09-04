# Better Solitaire App Store checklist

Checked against Apple's published requirements on September 3, 2026.

## Enforced in this repository

- Build with Xcode 26 or later and the iOS 26 SDK. The iOS CI job checks the SDK major version before building.
- Bundle a valid `PrivacyInfo.xcprivacy`. The app declares no tracking, collected data, or app-level required-reason API use; Capacitor 8.4.1 supplies its SDK privacy manifests.
- Declare `ITSAppUsesNonExemptEncryption` as false. Revisit this if networking, authentication, or cryptographic code is added.
- Keep the iPhone and iPad bundle configuration, orientations, app icon catalog, version, and build number valid. Automated tests check the stable configuration; each uploaded build still needs a unique build number.
- Build from a clean Capacitor sync and verify the simulator target.

## Complete in App Store Connect before submission

- Enroll in the Apple Developer Program and create the app record for bundle ID `dev.ehutt.solitaire`.
- Publish [PRIVACY.md](PRIVACY.md) at a stable public URL and provide that privacy policy URL even though the app does not collect data. Answer the App Privacy questionnaire as “No, we do not collect data from this app” unless app behavior changes.
- Complete the current age-rating questionnaire. Solitaire should be straightforward, but the answers—not an assumed rating—are required.
- Add the app name, subtitle, description, category, support URL, copyright, keywords, and review contact information.
- Upload current iPhone and iPad screenshots, then test the exact candidate build through TestFlight before review.
- Confirm distribution rights and retain source/license records for the vintage scans, classic court artwork, fonts, audio, and icons.
- Increment `CURRENT_PROJECT_VERSION` for every upload; increment `MARKETING_VERSION` for each public version.
- Answer export-compliance questions consistently with the Info.plist declaration.

## Primary Apple references

- [Upcoming submission requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Third-party SDK and privacy-manifest requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Manage app privacy and the required privacy-policy URL](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Encryption documentation](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation)
