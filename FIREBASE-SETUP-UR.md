# Firebase setup — Blogs By Mifrah

Firebase project: Beauty Tips (`beauty-tips-e2fc4`)

Admin UID: `VZYqhyprPtYWw2D4afr78JjldEJ2`

1. Firestore Database → Rules: publish `firestore.rules`.
2. Storage → Rules: publish `Cloudinary unsigned upload preset`.
3. Authentication → Sign-in method: Email/Password must be enabled.
4. Authentication → Users: the admin account must have the UID above.
5. Open the website. Go to `#/admin`. Sign in with the Firebase admin email/password.

Cloud behavior:
- Published articles are publicly readable.
- Draft/scheduled/private articles are readable only by the admin UID.
- Only the admin UID can create/update/delete articles and site settings/design.
- New article/hero images are uploaded to Cloudinary and remain cached locally for offline use.
- Existing local demo/content is not automatically uploaded to Firestore; publishing/saving through the authenticated Admin Panel uploads changes.
