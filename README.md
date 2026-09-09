# FRAME — Training PWA

A simple phone-first workout app built around the current 4-day calisthenics plan.

## Plan inside the app

- Monday: Workout A + 6–8 min handstand
- Tuesday: Workout B + 6–8 min handstand
- Wednesday: Rest
- Thursday: Workout A + 6–8 min handstand
- Friday: Rest
- Saturday: Workout B + 6–8 min handstand
- Sunday: Rest

No resistance band is assumed. Current pulling uses one-arm backpack rows. The first equipment upgrade suggested in the app is a pull-up bar.

## Main features

- Today screen: only the workout you need now
- Set/reps tracking and last-session targets
- Automatic rest timer
- Low Energy Mode
- Undo last set
- Screen Wake Lock when supported
- Haptic/vibration when supported
- Simple progression alerts after hitting the top of a rep range twice
- 6–8 minute handstand micro-session
- 5-minute posture/stretch routine
- Bodyweight tracking
- Progress photos every ~4 weeks: front / side / back
- Before ↔ Now photo comparison slider
- Photos stored locally in IndexedDB; the app itself does not upload them
- Full JSON export/import backup, including photos
- Offline PWA support

## Put it on GitHub Pages

1. Create a new GitHub repository, for example `frame-training`.
2. Upload **all files and the `icons` folder** from this project to the repository root.
3. In GitHub: **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your main branch and `/ (root)`, then Save.
6. Wait for GitHub Pages to show the site URL.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Tap **Add**.

It will then launch in standalone mode like an app.

## Notes

- Progress photos are local to the browser/app storage. Use Export Backup if you care about keeping them before clearing browser data or changing devices.
- Wake Lock and vibration/haptics depend on browser/iOS support.
- Stretching in the app is for mobility/posture, not guaranteed height gain.
