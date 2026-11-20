# Image Info

Firefox extension that lists all images of a page with everything that can be found out about them: where the page uses
them, how they loaded, their HTTP response headers and the metadata of their files (EXIF with the camera and the GPS
position, XMP, IPTC, the ICC color profile, the structure of the format). The metadata is read from what the browser
already has (its cache, `data:` and `blob:` addresses) — the images are not downloaded again.

The extension is the `imageInfo` module of AnalyticExtension built as a standalone Firefox extension: the core of
AnalyticExtension with only the parts this module needs, the module (`modules/imageInfo/`, which records the headers of
images and examines the pages) and its listing in the sandbox (`sandbox-modules/imageInfoSandbox/`). Everything except the
files of this repository (`README.md`, `package.json`, `tests/`, `scripts/`, `.github/`, …) comes from that build — change
the code there, not here.

## What it does

- **Records the HTTP headers of images** (Content-Type, Content-Length, Last-Modified, caching, …) while pages load them.
- **Lists the images of the page** in the toolbar popup and in the sidebar. Each image shows:
  - **on the page** — every place the page uses it (`<img>`, `<picture>`, CSS backgrounds, icons, video posters, images in
    SVG, preloads), the rendered and the natural size, whether it is hidden or outside the visible area, its text
    alternative;
  - **loading** — the status, from the cache or not, protocol, IP address, loading time, transferred and decoded size,
    redirects;
  - **HTTP headers** of the response;
  - **metadata** — format, dimensions, colors, JPEG quality, animation frames, color profile, and from EXIF/XMP/IPTC the
    camera, lens, date of the shot, GPS position (with a link to OpenStreetMap), author, copyright, title, description,
    software.
- **Badges** for what is worth a look: a tracking pixel, mixed content, an oversized image, a large file, an `<img>`
  without width and height, a missing text alternative, a file type that does not match Content-Type, the serial number of
  the camera or lens, a thumbnail embedded in the file (it may show the photo before a crop).
- **The toolbar of the listing**: search, order (as on the page, largest first, by name, by format), "Ignore small images",
  "Hide images not on the page", "Clean dynamically" (web apps that change the address without loading a new page),
  "Only important".
- **Buttons of an image**: Save image (from the browser, without downloading) or Download, Load information (downloads the
  image once more when headers or metadata are missing, optionally without cookies), Thumbnail, Remove from the document,
  Record permanently.
- **Permanent records**: the section "Permanently recorded images" keeps what the listing knew about an image after the tab
  is closed. Images with the serial number of the camera or lens are recorded by themselves (by default); a photo from
  another page with an already recorded serial number gets the badge "S/N match" — most likely the same device.
- **Notices** (Settings): for every property a badge, "important", a notification, a permanent record, or a badge over the
  image on the page itself.
- **Firefox only**: "Read the metadata of images of other origins while they load" — every image passes through the
  extension (`webRequest.filterResponseData()`), so images of other origins and images the browser does not cache have
  metadata too.

## Using the extension

### First-time setup

The welcome page opens after installation. The box at its top (the same is in Settings) shows what Image Info records;
click **Grant the permissions** and allow access to all websites and `webRequest`. Images loaded before that have no
recorded headers — reload the page. Firefox keeps the header recording only until its background page goes to sleep; after
the next restart of the browser it is permanent.

### While browsing

Click the toolbar button: the popup lists the images of the current page. The sidebar (View → Sidebar → Image Info) shows
the same listing next to the page. The listing lists the page when it is shown and with **Refresh**; to let the sidebar
follow another tab or a new address by itself, choose a "Start automatically" activation mode of Image Info Sandbox in
Settings. With the mode "On click of the main extension button" of Image Info, pages are examined only at that click.

## Permissions

| Permission | Granted | What for |
| --- | --- | --- |
| `storage` | at installation | settings, the permanent records |
| `activeTab` | at installation | the address of the active tab |
| `<all_urls>`, `scripting` | on request | listing the images of a page, reading their files from the browser cache |
| `webRequest` | on request | recording the HTTP headers of images |
| `webRequestBlocking`, `webRequestFilterResponse` | on request | reading images of other origins while they load (off by default) |
| `notifications` | on request | notifications of the notices and of serial-number matches (off by default) |

The extension sends nothing off the device (`data_collection_permissions`: `none`). Only the buttons Load information,
Download and Thumbnail download an image once more — from the server the page loaded it from.

## With AnalyticExtension

The extension works on its own. When AnalyticExtension is installed too, this extension offers it its modules; once you
allow that in the Settings of AnalyticExtension ("Modules from other extensions"), AnalyticExtension shows them in its
popup, sidebar and Settings, while the recording and the records stay with this extension. The listing has the button
"Block the image permanently" only in AnalyticExtension: it needs the Declarative Net Request module, which this extension
does not have.

## Development

```sh
npm install
npm test
```

Load the extension from `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → `manifest.json`. The type
check and the linters of the code run in AnalyticExtension (`npm run check`).

## Release

Each upload to addons.mozilla.org needs a higher version. In AnalyticExtension:

```sh
powershell -ExecutionPolicy Bypass -File scripts\build-module-firefox.ps1 -Module imageInfo -Version X.Y.Z
npm run sync:module -- imageInfo ../imageInfo   # copies the build and its zip here, sets the version of package.json
```

The sync refuses to run over uncommitted changes here. Then here:

```sh
npm test
git commit -m "imageInfo X.Y.Z"
git tag vX.Y.Z
git push --follow-tags
npm publish
```

The zip for addons.mozilla.org is `dist/imageInfo-firefox-X.Y.Z.zip` here. The npm package is `imageinfo-extension`
(npm does not allow capital letters in new package names).

## License

[CC BY-SA 4.0](LICENSE)
