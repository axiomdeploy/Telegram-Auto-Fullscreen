# Telegram Auto Fullscreen

A free Chrome / Brave extension that automatically puts videos into fullscreen when you open them in Telegram Web on your PC.

Works only on `https://web.telegram.org`. It does not run on any other website.

---

## Features

- **Auto fullscreen:** Opening a video goes fullscreen right away.
- **Smart pause:** If you leave fullscreen yourself, auto fullscreen pauses. It resumes when you open another video, go fullscreen again, or leave the Telegram tab.
- **ON / OFF switch:** Drag the knob or tap it. The demo video above it grows as you drag.
- **Safe mode:** Adds small random delays and limits attempts per minute, so the extension behaves more like normal human use.
- **Auto exit:** When you close a video, the extension leaves fullscreen for you. You can turn this off.
- **Counter:** Shows how many auto fullscreens have happened.
- **Keyboard support:** Space, Enter, and the arrow keys work on the switch.

---

## Installation

1. Download the latest release, or clone or download this repository as a ZIP.
2. Extract the files to a folder you will keep, for example `C:\Extensions\TelegramAutoFullscreen`. Do not delete this folder after installing, because the browser loads the extension from it.
3. Open the extensions page:
   - Brave: `brave://extensions`
   - Chrome: `chrome://extensions`
4. Turn on **Developer mode** (top-right corner).
5. Click **Load unpacked** and select the `TelegramAutoFullscreen` folder (the one that contains `manifest.json`).
6. Pin the extension to the toolbar for easy access.
7. Open `https://web.telegram.org` and press `F5` to refresh the tab.

### Updating

1. Replace the old files in your extension folder with the new ones.
2. Go to the extensions page and click the **Reload** icon on the extension card.
3. Press `F5` on the Telegram tab.

---

## How to Use

1. Open Telegram Web and click any video.
2. It goes fullscreen automatically.
3. To stop auto fullscreen, click the extension icon and switch it **OFF**.
4. To leave fullscreen yourself, press `Esc` or `F`. Auto fullscreen pauses until the next video, or until you go fullscreen again.

### Options

| Option    | Default | What it does                                              |
| --------- | ------- | --------------------------------------------------------- |
| Safe mode | ON      | Random human-like delays and per-minute attempt limits    |
| Auto exit | ON      | Leaves fullscreen when the video viewer is closed         |

---

## How It Works

| File                    | Role                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content.js`            | Watches Telegram for a video, decides when to go fullscreen, and handles the pause logic                                                                             |
| `background.js`         | Backup method. If the browser blocks a normal click, it sends real mouse or keyboard input through Chrome's debugger API, then detaches right away                  |
| `popup.html` / `popup.js` | The popup: switch, options, and counter                                                                                                                            |

Fullscreen is tried in this order, and the first method that works is used:

1. A normal click on Telegram's own fullscreen button (fastest, no debugger needed).
2. A click with a user-gesture flag, sent from the background script.
3. A real mouse click on the button.
4. A real `F` key press.
5. `requestFullscreen()` on the video viewer.

---

## Permissions and Privacy

| Permission                      | Why it is needed                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                       | Saves the ON/OFF switch, options, and counter on your computer                                                                                    |
| `debugger`                      | Used only as a backup, to send real mouse or keyboard input when the browser blocks a normal click. It is attached for a fraction of a second, then detached |
| `https://web.telegram.org/*`    | The only site the extension runs on                                                                                                               |

The extension:

- does **not** send any data to any server
- does **not** read your chats or messages
- does **not** change anything in Telegram, except clicking the video's own fullscreen button and pressing `F` when needed

The browser may show a warning that the extension is "debugging this browser". This comes from the debugger permission. It is normal and goes away when the extension detaches.

---

## Troubleshooting

| Problem                                         | Fix                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nothing happens when I open a video             | Make sure the switch is ON. Press `F5` on the Telegram tab.                               |
| Stopped working after an update                 | Click **Reload** on the extension card, then press `F5` on the Telegram tab.              |
| Fullscreen works only sometimes                 | Keep DevTools (`F12`) closed. Try turning Safe mode OFF and compare.                      |
| Video goes fullscreen, then exits immediately   | Turn Auto exit OFF and test again.                                                        |
| Console shows "Extension context invalidated"   | The extension was reloaded. Press `F5` on the Telegram tab.                               |
| I want to see what is happening                 | Open the DevTools console and filter for `[TG-AutoFS]`.                                   |

---

## FAQ

**Will my account get banned?**
The extension does not send messages, read chats, or access your account. It only clicks the fullscreen button on videos you open. Safe mode is ON by default to keep its behavior close to normal use. No extension can guarantee that nothing will ever happen, so use it at your own risk.

**Does it work on mobile?**
No. It is a desktop browser extension for Chrome and Brave.

**Does it work in Firefox?**
Not in this version. It is built for Chromium-based browsers (Chrome, Brave, Edge).

---

## Known Limitations

- Works only on Telegram Web in a desktop Chromium browser.
- Telegram can change its page structure at any time. If that happens, the button selectors in `content.js` and `background.js` may need updating.
- The first fullscreen attempt is the fastest. Backup methods take a little longer.

---

## Contributing

Contributions are welcome. You can:

- Report bugs or suggest features using the Issues tab
- Fork the repository and open a Pull Request
- Improve the README or translations

---

## Disclaimer

This is an unofficial project made for personal convenience. It is not affiliated with or endorsed by Telegram. You are responsible for how you use it and for following Telegram's Terms of Service.

---

## Project Structure

```
TelegramAutoFullscreen/
├── manifest.json     # Extension settings (name, version, permissions)
├── content.js        # Video detection and fullscreen logic
├── background.js     # Backup fullscreen method (debugger)
├── popup.html        # Popup layout and styles
├── popup.js          # Popup switch, options, and counter
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Version History

- **1.3.0:** Scrub animation while dragging, pause resets when leaving Telegram, Safe mode, Auto exit option, counter, English text.
- **1.2.0:** Black theme, drag/tap switch, faster fullscreen with a direct-click path.
- **1.1.0:** First ON/OFF version with popup.

---

## License

This project is licensed under the **MIT License**. You are free to use, copy, modify, merge, publish, distribute, and share it, including for commercial use, as long as the copyright notice is kept.

```
MIT License

Copyright (c) 2026 [axiomdeploy]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
