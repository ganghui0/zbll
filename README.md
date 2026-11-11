# zbll trainer
## [bestsiteever.net/zbll](https://www.bestsiteever.net/zbll) - web application for speedcubers for practicing ZBLL recognition and execution.

## Smart cube

The Bluetooth button on the timer page connects a smart cube (GAN, MoYu, QiYi, Giiker, GoCube), using
[smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth). It needs a browser with Web Bluetooth:
Chrome or Edge on a computer or on Android, on https or localhost.

With a cube connected there is nothing to scramble. Each case is put on a virtual cube, which follows every turn of
the real one, and its tilt if the cube has a gyro. The timer starts at your first turn (or when the case appears, see
the settings) and stops when the case is solved, then the next case comes up.

- Hold the real cube like the virtual one: with the cross color at the bottom (white by default, see the settings).
  If you have another side in front than the virtual cube, your turns show up on other faces, but the solve still
  counts and the virtual cube is turned to match from then on.
- <kbd>Space</kbd> or a tap starts and pauses.
- During a case, space or a tap gives up: the case is kept as a DNF with its algs on screen and put back on the
  virtual cube, and the trainer pauses so that you can try them.
- <kbd>Esc</kbd> drops the current attempt and pauses.
- Your hands can stay on the cube: turning the top face all the way around (U four times) starts like space,
  turning the bottom face all the way around the other way (D' four times) stops like Esc. A case you had just
  solved still counts. This can be switched off in the settings.
- Drag the virtual cube with the mouse to look at it from another side. Double click to undo that, and to tell the
  trainer that you hold the cube upright right now.

## Sync to Google Drive

Settings → *Sync to Google Drive* → *Sign in* keeps a history of every solve in your own Google Drive: the folder
`ZBLL Trainer` with the one file `zbll-trainer-stats.json`. There is no server: the browser talks to Google itself, and
only asks for the `drive.file` permission, which covers the files the trainer made and nothing else in your Drive.

- Every result, DNFs included, and every deleted result is queued in the browser and sent a few seconds later, in the
  background. Without a connection the results wait and are sent when it is back. The settings show when the last sync
  was and how many results wait.
- The file holds all solves of all sessions, browsers and devices: `{"app", "version", "updatedAt", "solves": [...]}`,
  one solve on a line, with `id`, `timestamp` (ISO), `caseKey`, `set` (T, U, ...), `timeMs`, `dnf`, `scramble`,
  `input` (`keyboard`, `touch` or `smart_cube`), `crossColor` (smart cube only) and `origin` (the page it was done on).
  A deleted result stays in the file with `deleted: true`; clearing the session does not touch the file. The results
  that were in the browser before the first sign in are sent too, without a time.
- Google's access lasts an hour at a time. The trainer renews it by itself, in a hidden frame, where the browser lets
  Google see its cookies there (Chrome and Edge do by default). Where it cannot, a cloud icon in the top bar asks to
  sign in again, and the results wait until then. *Sign out* stops the sync in that browser only.

It needs a Google Cloud project of your own, once:

1. On [console.cloud.google.com](https://console.cloud.google.com) make a project and, under *APIs & Services →
   Library*, enable the *Google Drive API*.
2. Under *Google Auth Platform* (the OAuth consent screen) click *Get started*: an app name, your email, audience
   *External*. Then under *Audience* add your own Google account to the *Test users*.
3. Under *Clients* create a client of the type *Web application*, with
   - Authorized JavaScript origins: the site, like `https://<you>.github.io`, and `http://localhost:5173`
   - Authorized redirect URIs: `https://<you>.github.io/zbll/oauth-silent.html` and
     `http://localhost:5173/oauth-silent.html` (for renewing the access without a click)
4. Put the client ID in [src/config.js](src/config.js). It is not a secret.

While the app is in *Testing*, Google lets the permission run out after about a week and you sign in again;
*Publish app* on the *Audience* page ends that.

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```
