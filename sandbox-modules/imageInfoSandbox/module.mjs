//@ts-check
"use strict";

// sandbox-modules/imageInfoSandbox/module.mjs
// The module description without DOM (see imageInfoSandbox.mjs).
import { BACKGROUND_OR_FOCUS_SPEC, getTagName, ModeSpecification, NOT_DISABLED_SPEC, t } from "../../sdk.mjs";

export const MODULE_NAME = "imageInfoSandbox";
export const TAG = getTagName(MODULE_NAME); // "extension-image-info-sandbox"

// t() reads the module's own texts — messages.json of the package (an uploaded module cannot add them to _locales).
export const DESCRIPTION = t("imageInfoSandbox_description");

// Shown everywhere — on a page that is not a web page it says so.
export const ACTIVATION_SPEC = NOT_DISABLED_SPEC;
// In the "Start automatically, …" modes the listing follows the page by itself: another tab or a new address
// (api.tabs.onChange) and the images the page loads afterwards (the listener imageInfo.onChange). In the other modes
// it lists the page when it is shown and with the Refresh button — except ICON_CLICK_SPEC below.
export const LIVE_SPEC = BACKGROUND_OR_FOCUS_SPEC;
// The "On click of the main extension button" mode: outside the popup (which itself opens by that click and lists the page
// when it is shown) the listing lists the page only after a click on the extension button (api.activation.onIconClick() —
// also the click that opened the surface a moment ago, the dashboard) and with the Refresh button; it follows neither
// another tab nor a new address meanwhile.
export const ICON_CLICK_SPEC = new ModeSpecification("icon_click");
// The focus mode works only with a visible document: a change while the surface is hidden shows up once it is
// visible again.
export const VISIBLE_ONLY_SPEC = new ModeSpecification("focus");

/** @type {Types.ModuleDescriptor['DEFAULT_ACTIVATION_MODE']} */
export const DEFAULT_ACTIVATION_MODE = "popup";
// A long listing — into the side panel next to the page, not into the briefly opened popup.
/** @type {Types.ModuleDescriptor['DEFAULT_DISPLAY_LOCATION']} */
export const DEFAULT_DISPLAY_LOCATION = "sidebar";
/** @type {Types.ModuleDescriptor['DEFAULT_OUTPUT_ELEMENT']} */
export const DEFAULT_OUTPUT_ELEMENT = "details-open";
/** @type {Types.ModuleDescriptor['DEFAULT_SHOW_HEADING']} */
export const DEFAULT_SHOW_HEADING = false;

// The look of the listing — a file of the package, the sandbox applies it to its own page after mvp.css.
/** @type {string[]} */
export const STYLES = [new URL("./imageInfoSandbox.css", import.meta.url).href];

// Without imageInfo there is nothing to list — the headers and the frames of the page are its work.
/** @type {Types.ModuleDependency[]} */
export const DEPENDS_ON = [{ module: "imageInfo", reason: t("imageInfoSandbox_depends_image_info") }];

// The functions outside the sandbox the listing works with (registerModule({ capabilities })): the images of the page
// are not the module's own data — the background part of imageInfo lists them (imageInfo.getPage) and the core says when
// the tab loaded more of them or the settings changed (the listener imageInfo.onChange) and which of them the page shows
// and the user points at (the listener imageInfo.onView — the highlights of the lines); the buttons of an image download it
// once more (imageInfo.fetchImage), save it (imageInfo.saveImage), show its thumbnail (imageInfo.readImage), remove it from
// the page (imageInfo.removeImage) and block it permanently — the core hands its address over to the rule of the blocked
// images of the module declarativeNetRequest (imageInfo.blockImage); the marks of the properties of images on the page itself
// (imageInfo.markImages — the column "page" of NOTICES_KEY below); options.open opens Settings, where imageInfo asks for
// the permissions (a sandboxed module cannot ask for a permission); tabs.activate brings the tab of a notification of the
// listing to the front after a click on it (NOTICE_OPEN_MS). The extension brings the module itself, so they are
// allowed until the user denies them in Settings → "Uploaded modules (sandbox)".
/** @type {Types.ModuleDescriptor['CAPABILITIES']} */
export const CAPABILITIES = [
	"imageInfo.getPage",
	"imageInfo.fetchImage",
	"imageInfo.saveImage",
	"imageInfo.readImage",
	"imageInfo.removeImage",
	"imageInfo.blockImage",
	"imageInfo.markImages",
	"imageInfo.onChange",
	"imageInfo.onView",
	"options.open",
	"tabs.activate",
];

// The sort order of the listing — module state (api.state), not a setting: it is switched directly in the listing.
export const SORT_STATE_KEY = "sortOrder";
// The images announced by notifications (the setting NOTICES_KEY below) — api.state (chrome.storage.local), shared by all
// surfaces of the module: another listing of the same document does not announce them again. Not api.sessionState: the
// floating window's <iframe> in Firefox 157 has no chrome.storage.session. A document is its tab and the time it started
// (noticeDocument() of format.mjs), so the records of an earlier browser session never match; NOTICE_MAX_DOCUMENTS of them.
export const NOTICE_STATE_KEY = "announcedNotices";
// A click on a notification of the listing (api.notifications.onClick()) in the side panel or the floating window: the tab
// of the notification comes to the front, and once the listing lists its document (within NOTICE_OPEN_MS) the images of the
// notification are expanded and shown even when they would be hidden; the page scrolls to the first of them. The data of a
// notification name at most NOTICE_MAX_IMAGES images (the newest).
export const NOTICE_OPEN_MS = 15000;
export const NOTICE_MAX_IMAGES = 50;
/** @type {Enums.ImageInfoSandbox.SortOrder[]} */
export const SORT_ORDERS = ["page", "size", "name", "type"];
/** @type {Enums.ImageInfoSandbox.SortOrder} */
export const DEFAULT_SORT = "page";

// How long after a change the listing asks again (several images loaded in quick succession = one listing).
export const REFRESH_DELAY_MS = 400;
// How many times the side panel lists a page that is still loading again (every REFRESH_DELAY_MS) after another tab or
// a new address, outside the "Start automatically, …" modes.
export const LOADING_RETRIES = 10;

// Ignoring small images — a setting of the module (on by default): the checkbox in the toolbar of the listing and the same
// one in Settings. An image is small when its size (the pixels of the file, otherwise the natural size of the <img>) is
// smaller than the width and at the same time than the height set in Settings — 1×1 tracking pixels, spacers, small
// icons; the listing leaves it out (it still reads it). Without the exact size the estimate by its usages decides (the
// width and height attributes, the rendered size, sizes of an icon — format.mjs); an image without any of them stays,
// except an ICO file (a favicon), which counts as small.
// Hiding the images "not on the page" (the page only loaded them, no element or CSS uses them — the icon of the tab, an
// image loaded by a script) — a setting of the module (on by default), the checkbox in the toolbar and in Settings.
export const HIDE_UNUSED_KEY = "hideUnusedImages";
export const DEFAULT_HIDE_UNUSED = true;
// Cleaning the listing dynamically — a setting of the module (on by default), the checkbox in the toolbar and in Settings:
// when the page changes its address without loading a new document (a web app such as Reddit or Facebook only swaps
// the content — history.pushState()), the listing leaves out the images it listed before the change (format.mjs).
export const CLEAN_DYNAMIC_KEY = "cleanDynamically";
export const DEFAULT_CLEAN_DYNAMIC = true;
// Only the important images — a setting of the module (on by default), the checkbox in the toolbar and in Settings: the
// listing shows only the images with a property whose "Important badge (never hide)" is on (isKept() of format.mjs); while
// no property is important, it hides nothing.
export const ONLY_IMPORTANT_KEY = "onlyImportantImages";
export const DEFAULT_ONLY_IMPORTANT = true;
export const IGNORE_SMALL_KEY = "ignoreSmallImages";
export const DEFAULT_IGNORE_SMALL = true;
export const SMALL_WIDTH_KEY = "smallImageWidth";
export const SMALL_HEIGHT_KEY = "smallImageHeight";
export const DEFAULT_SMALL_SIZE = 500;
export const MAX_SMALL_SIZE = 10000;

// The size from the stored value (a "number" field stores text) — always a whole number of pixels 1 … MAX_SMALL_SIZE.
/** @type {Functions.ImageInfoSandbox.Module.resolveSmallSize} */
export function resolveSmallSize(value) {
	const number = Math.round(Number(value));
	if (!Number.isFinite(number) || number <= 0 || (typeof value === "string" && !value.trim())) return DEFAULT_SMALL_SIZE;
	return Math.min(MAX_SMALL_SIZE, number);
}

// Notices about some properties of an image — a setting of the module, the table of checkboxes in Settings (the field
// type "checkboxTable" of the core): for every property (NOTICE_TAGS, noticeTags() of format.mjs) six choices
// (NOTICE_ACTIONS):
// - "badge" — the line of the image has the badge of the property, otherwise the listing shows it nowhere (the details
//   still have the values);
// - "keep" — the listing never hides such an image: not as a small one, not as one not on the page, not by cleaning
//   dynamically (the search still filters it);
// - "notify" — a silent notification once the listing finds such an image in the document (only a listing that is shown
//   reads the metadata — in the side panel or the floating window it follows the page by itself). The notification needs
//   the permission for notifications — Settings asks for it under the table (the column has notifications: true);
// - "record" — once the listing finds such an image (in any document, also one the page only loaded), it records it
//   permanently, the same as the button "Record permanently" in its details (the permanent records below) — once for the
//   image; not one whose permanent record the user removed. Only a listing that is shown, like "notify". By default only
//   the serial number of the camera and the serial number of the lens;
// - "page" — a badge with the icon of the property over the image on the page itself (NOTICE_ICONS, a property without its
//   own icon has NOTICE_DEFAULT_ICON; one badge for all properties of the element), the details under the mouse pointer —
//   imageInfo.markImages, only images the page uses, while the listing is shown (it sends the marks again every
//   MARK_RENEW_MS — the frames of the page take them away after the lease of the core's background part);
// - "pageLarge" — the same as "page", but only over the images that are not small (isSmallImage() of format.mjs with the
//   size of SMALL_WIDTH_KEY and SMALL_HEIGHT_KEY — even when small images are not ignored).
// The properties: of the photo — the place of the shot (GPS or the place in words), the camera, the date and time of the
// shot, a serial number of the camera, a serial number of the lens (SERIAL_KINDS), a thumbnail embedded in the file (it may show the original before a crop
// or an edit), the author or the copyright, the software; of the page — no text alternative, an <img> without the width
// and height attributes; of the file and its loading — another type than Content-Type says, a failed load, an http image
// on an https page (mixed content), a tracking pixel (at most TRACKING_PIXEL_SIZE px from another origin), an image of
// another origin, an animated one, an oversized one (the file larger than the page renders it — the factor of the setting
// OVERSIZE_KEY) and a large file (more than LARGE_FILE_KEY kB); the other badges of the listing — everything loaded (✓),
// removed, not loaded, not on the page, from the cache, lazy loading, the EXIF, XMP and IPTC metadata and GPS coordinates.
// By default the badges the listing always had are shown, of the new properties all but the software and the missing
// width and height (very common), and an image with a serial number of the camera or of the lens is recorded permanently;
// nothing more. The row "serial" is the camera (it was the camera or the lens before "lensSerial" — its stored choices stay
// with the camera, the lens starts with the defaults).
export const NOTICES_KEY = "imageNotices";
/** @type {Enums.ImageInfoSandbox.NoticeTag[]} */
export const NOTICE_TAGS = [
	"place",
	"camera",
	"taken",
	"serial",
	"lensSerial",
	"exifThumbnail",
	"copyright",
	"software",
	"noLabel",
	"noDimensions",
	"mismatch",
	"failed",
	"mixedContent",
	"trackingPixel",
	"crossOrigin",
	"animated",
	"oversized",
	"largeFile",
	"complete",
	"removed",
	"notLoaded",
	"unused",
	"fromCache",
	"lazy",
	"exif",
	"xmp",
	"iptc",
	"gps",
];
/** @type {Enums.ImageInfoSandbox.NoticeAction[]} */
export const NOTICE_ACTIONS = ["badge", "keep", "notify", "record", "page", "pageLarge"];
/** @type {ReadonlySet<Enums.ImageInfoSandbox.NoticeTag>} */
const NO_BADGE_BY_DEFAULT = new Set(["software", "noDimensions"]);
/** @type {ReadonlySet<Enums.ImageInfoSandbox.NoticeTag>} */
const RECORD_BY_DEFAULT = new Set(["serial", "lensSerial"]);
/** @type {Types.ImageInfoSandbox.Notices} */
export const DEFAULT_NOTICES = /** @type {Types.ImageInfoSandbox.Notices} */ (
	Object.fromEntries(
		NOTICE_TAGS.map((tag) => [tag, { badge: !NO_BADGE_BY_DEFAULT.has(tag), keep: false, notify: false, record: RECORD_BY_DEFAULT.has(tag), page: false, pageLarge: false }])
	)
);

// Permanent records of images — the button "Record permanently" in the details of an image and the column "record" of
// NOTICES_KEY: a snapshot of the image as the listing has it (the address, where the page uses it, the loading, the headers,
// the metadata — shortened to RECORD_LIMITS, compactRecordImage() of format.mjs) with the page, the time and the properties
// (permanentRecord() of format.mjs) goes into the shared IndexedDB of the core (api.data.log() under its own key — the key
// of the image, api.data.findByKey()). It stays there after the tab closes and after a restart of the browser, until the
// user removes it in the section "Permanently recorded images" of the listing (api.data.remove()), which shows the newest
// MAX_PERMANENT_RECORDS of them with the same details as an image of the page. One record for an image (its key).
// The records are merged by the serial number: a record of an image with a serial number of the camera (serialIds() of
// format.mjs — the first of them), without one with a serial number of the lens, goes under the key SERIAL_KEY_PREFIX + the
// serial number instead of the key of the image, so api.data.findByKey() gives all records of the camera (or of the lens of
// the photos without the camera's one) at once (at most MAX_SERIAL_RECORDS, the newest), and the section shows the records of
// one serial number as one group — of the camera or of the lens (SERIAL_KINDS; one prefix for both: the record says which).
// Version 1 (before the merging) kept every record under the key of its image, version 2 had the serial numbers of the camera
// and of the lens in one list — the listing still reads them and sorts their serial numbers by the metadata of their image.
export const MAX_PERMANENT_RECORDS = 200;
export const RECORD_VERSION = 3;
export const SERIAL_KEY_PREFIX = "serial ";
export const MAX_SERIAL_RECORDS = 100;
// The kinds of the serial numbers: of the camera (the body — EXIF SerialNumber, XMP aux:SerialNumber, exifEX:BodySerialNumber,
// …) and of the lens (EXIF LensSerialNumber, XMP aux:LensSerialNumber, exifEX:LensSerialNumber) — serialKind() of format.mjs.
/** @type {Enums.ImageInfoSandbox.SerialKind[]} */
export const SERIAL_KINDS = ["camera", "lens"];
// A match of the serial number: an image of the page whose serial number of the camera (or of the lens) is also in a permanent
// record of another image recorded on another page (the address without the fragment) as a serial number of the camera (of the
// lens) — the same camera or lens elsewhere, e.g. on another website (serialMatches() of format.mjs). The records of the same
// page do not count (a gallery of one camera would match itself). The listing looks for the matches by itself (the line of such
// an image has the badge of the match of the camera or of the lens, its details the matching records); with the setting
// SERIAL_MATCH_NOTIFY_KEY (the camera) or LENS_SERIAL_MATCH_NOTIFY_KEY (the lens) — checkboxes, off by default — a silent
// notification says so — once for every image and serial number of a document, remembered for all surfaces like the notices
// (MATCH_STATE_KEY), a click on it works like a click on a notification of the notices (NOTICE_OPEN_MS). Only a listing
// that is shown, like "notify". With "record" of the serial number on (the default) the matching image is recorded too —
// into the group of its serial number.
export const SERIAL_MATCH_NOTIFY_KEY = "notifySerialMatch";
export const LENS_SERIAL_MATCH_NOTIFY_KEY = "notifyLensSerialMatch";
export const DEFAULT_SERIAL_MATCH_NOTIFY = false;
// The setting of the notification of a match of each kind.
/** @type {Readonly<Record<Enums.ImageInfoSandbox.SerialKind, string>>} */
export const MATCH_NOTIFY_KEYS = { camera: SERIAL_MATCH_NOTIFY_KEY, lens: LENS_SERIAL_MATCH_NOTIFY_KEY };
export const MATCH_STATE_KEY = "announcedSerialMatches";
// The most serial numbers the text of a notification of a match names (the rest is "…").
export const MATCH_NOTIFY_LINES = 3;
// The most usages of the image, characters of a value (a header, an entry of the metadata) and entries of the metadata a
// record keeps — a record does not grow without a limit (the rest is left out, the metadata then has the warning "limit").
export const RECORD_LIMITS = Object.freeze({ usages: 20, value: 2000, entries: 2000 });
// A change of the permanent records (api.state — shared by all surfaces of the module, chrome.storage.local): the time of
// the last record or removal — every listing loads its records again.
export const RECORDS_STATE_KEY = "permanentRecordsChanged";
// The keys of the images whose permanent record the user removed (api.state, the newest MAX_DISMISSED_RECORDS): automatic
// recording ("record") does not record them again — the button does (and forgets the removal).
export const DISMISSED_STATE_KEY = "dismissedRecords";
export const MAX_DISMISSED_RECORDS = 1000;

// The icons of the properties on the page (the same as the badges of the listing); a property without its own icon has
// NOTICE_DEFAULT_ICON.
/** @type {Readonly<Partial<Record<Enums.ImageInfoSandbox.NoticeTag, string>>>} */
export const NOTICE_ICONS = { place: "🗺", camera: "📷", taken: "📅", copyright: "©", software: "🛠" };
export const NOTICE_DEFAULT_ICON = "🛈";
// How often the listing sends the marks on the page again while it is shown (ms) — less than half of the lease of the
// frames (MARK_LEASE_MS of modules/imageInfo/module.mjs, tests/sandbox.test.mjs checks it).
export const MARK_RENEW_MS = 5000;
// The limits of the marks the core accepts (SANDBOX_IMAGE_INFO_MARK_LIMITS of base.mjs, tests/sandbox.test.mjs checks they are
// the same): the most images and marks of one, the most characters of the name of a property, of its details and of the file
// name — the listing shortens longer texts from the page and the metadata itself.
export const MARK_LIMITS = Object.freeze({ images: 500, marks: 32, icon: 8, label: 200, detail: 500, name: 200 });

// The icon of a property on the page.
/** @type {Functions.ImageInfoSandbox.Module.noticeIcon} */
export function noticeIcon(tag) {
	return NOTICE_ICONS[tag] ?? NOTICE_DEFAULT_ICON;
}

// A tracking pixel: an image of another origin at most this many px wide and high.
export const TRACKING_PIXEL_SIZE = 2;
// An oversized image: its pixels more than OVERSIZE_KEY times the largest size the page renders it at, in both directions
// (a setting of the module, a "number" field — text; 3 by default: a picture for a display with 2 pixels per CSS pixel is
// not oversized yet).
export const OVERSIZE_KEY = "oversizeFactor";
export const DEFAULT_OVERSIZE_FACTOR = 4;
export const MAX_OVERSIZE_FACTOR = 100;
// A large file: more than LARGE_FILE_KEY kB (1 kB = 1000 bytes, as the listing writes sizes; a setting of the module).
export const LARGE_FILE_KEY = "largeFileKB";
export const DEFAULT_LARGE_FILE_KB = 500;
export const MAX_LARGE_FILE_KB = 1000000;

// The factor of an oversized image from the stored value: a number greater than 1 (with decimals), at most
// MAX_OVERSIZE_FACTOR, otherwise the default.
/** @type {Functions.ImageInfoSandbox.Module.resolveOversizeFactor} */
export function resolveOversizeFactor(value) {
	const number = typeof value === "string" ? Number(value.trim().replace(",", ".")) : Number(value);
	if (!Number.isFinite(number) || number <= 1 || (typeof value === "string" && !value.trim())) return DEFAULT_OVERSIZE_FACTOR;
	return Math.min(MAX_OVERSIZE_FACTOR, number);
}

// The size of a large file in kB from the stored value: a whole number 1 … MAX_LARGE_FILE_KB, otherwise the default.
/** @type {Functions.ImageInfoSandbox.Module.resolveLargeFileKB} */
export function resolveLargeFileKB(value) {
	const number = Math.round(Number(value));
	if (!Number.isFinite(number) || number <= 0 || (typeof value === "string" && !value.trim())) return DEFAULT_LARGE_FILE_KB;
	return Math.min(MAX_LARGE_FILE_KB, number);
}

// The notices from the stored value (the table Settings stores): a stored choice (true/false) wins, otherwise the default.
/** @type {Functions.ImageInfoSandbox.Module.resolveNotices} */
export function resolveNotices(value) {
	const stored = /** @type {Record<string, unknown>} */ (value && typeof value === "object" && !Array.isArray(value) ? value : {});
	/** @type {Partial<Types.ImageInfoSandbox.Notices>} */
	const notices = {};
	for (const tag of NOTICE_TAGS) {
		const cells = /** @type {Record<string, unknown>} */ (stored[tag] && typeof stored[tag] === "object" ? stored[tag] : {});
		/** @type {(action: Enums.ImageInfoSandbox.NoticeAction) => boolean} */
		const choice = (action) => (typeof cells[action] === "boolean" ? /** @type {boolean} */ (cells[action]) : DEFAULT_NOTICES[tag][action]);
		notices[tag] = { badge: choice("badge"), keep: choice("keep"), notify: choice("notify"), record: choice("record"), page: choice("page"), pageLarge: choice("pageLarge") };
	}
	return /** @type {Types.ImageInfoSandbox.Notices} */ (notices);
}

// The rows and the columns of the table in Settings.
/** @type {Readonly<Record<Enums.ImageInfoSandbox.NoticeTag, string>>} */
const NOTICE_TAG_TEXTS = {
	place: "imageInfoSandbox_notice_place",
	camera: "imageInfoSandbox_notice_camera",
	taken: "imageInfoSandbox_notice_taken",
	serial: "imageInfoSandbox_notice_serial",
	lensSerial: "imageInfoSandbox_notice_lens_serial",
	exifThumbnail: "imageInfoSandbox_notice_exif_thumbnail",
	copyright: "imageInfoSandbox_notice_copyright",
	software: "imageInfoSandbox_notice_software",
	noLabel: "imageInfoSandbox_notice_no_label",
	noDimensions: "imageInfoSandbox_notice_no_dimensions",
	mismatch: "imageInfoSandbox_notice_mismatch",
	failed: "imageInfoSandbox_notice_failed",
	mixedContent: "imageInfoSandbox_notice_mixed_content",
	trackingPixel: "imageInfoSandbox_notice_tracking_pixel",
	crossOrigin: "imageInfoSandbox_notice_cross_origin",
	animated: "imageInfoSandbox_notice_animated",
	oversized: "imageInfoSandbox_notice_oversized",
	largeFile: "imageInfoSandbox_notice_large_file",
	complete: "imageInfoSandbox_notice_complete",
	removed: "imageInfoSandbox_notice_removed",
	notLoaded: "imageInfoSandbox_notice_not_loaded",
	unused: "imageInfoSandbox_notice_unused",
	fromCache: "imageInfoSandbox_notice_from_cache",
	lazy: "imageInfoSandbox_notice_lazy",
	exif: "imageInfoSandbox_notice_exif",
	xmp: "imageInfoSandbox_notice_xmp",
	iptc: "imageInfoSandbox_notice_iptc",
	gps: "imageInfoSandbox_notice_gps",
};
/** @type {Readonly<Record<Enums.ImageInfoSandbox.NoticeAction, [string, string]>>} */
const NOTICE_ACTION_TEXTS = {
	badge: ["imageInfoSandbox_notice_badge", "imageInfoSandbox_notice_badge_title"],
	keep: ["imageInfoSandbox_notice_keep", "imageInfoSandbox_notice_keep_title"],
	notify: ["imageInfoSandbox_notice_notify", "imageInfoSandbox_notice_notify_title"],
	record: ["imageInfoSandbox_notice_record", "imageInfoSandbox_notice_record_title"],
	page: ["imageInfoSandbox_notice_page", "imageInfoSandbox_notice_page_title"],
	pageLarge: ["imageInfoSandbox_notice_page_large", "imageInfoSandbox_notice_page_large_title"],
};

// The name of a property in the language of the interface (the row of the table, the text of the notification).
/** @type {Functions.ImageInfoSandbox.Module.noticeTagText} */
export function noticeTagText(tag) {
	return t(NOTICE_TAG_TEXTS[tag]);
}

/** @type {Types.SettingField[]} */
export const SETTINGS_SCHEMA = [
	{
		key: HIDE_UNUSED_KEY,
		label: t("imageInfoSandbox_setting_hide_unused"),
		type: "checkbox",
		default: DEFAULT_HIDE_UNUSED,
	},
	{
		key: CLEAN_DYNAMIC_KEY,
		label: t("imageInfoSandbox_setting_clean_dynamic"),
		type: "checkbox",
		default: DEFAULT_CLEAN_DYNAMIC,
	},
	{
		key: ONLY_IMPORTANT_KEY,
		label: t("imageInfoSandbox_setting_only_important"),
		type: "checkbox",
		default: DEFAULT_ONLY_IMPORTANT,
	},
	{
		key: IGNORE_SMALL_KEY,
		label: t("imageInfoSandbox_setting_ignore_small"),
		type: "checkbox",
		default: DEFAULT_IGNORE_SMALL,
	},
	{
		key: SMALL_WIDTH_KEY,
		label: t("imageInfoSandbox_setting_small_width"),
		type: "number",
		default: String(DEFAULT_SMALL_SIZE),
	},
	{
		key: SMALL_HEIGHT_KEY,
		label: t("imageInfoSandbox_setting_small_height"),
		type: "number",
		default: String(DEFAULT_SMALL_SIZE),
	},
	{
		key: NOTICES_KEY,
		label: t("imageInfoSandbox_setting_notices"),
		type: "checkboxTable",
		rows: NOTICE_TAGS.map((tag) => ({ value: tag, label: noticeTagText(tag) })),
		columns: NOTICE_ACTIONS.map((action) => ({
			value: action,
			label: t(NOTICE_ACTION_TEXTS[action][0]),
			title: t(NOTICE_ACTION_TEXTS[action][1]),
			...(action === "notify" ? { notifications: true } : {}),
		})),
		default: DEFAULT_NOTICES,
	},
	{
		key: SERIAL_MATCH_NOTIFY_KEY,
		label: t("imageInfoSandbox_setting_notify_serial_match"),
		type: "checkbox",
		default: DEFAULT_SERIAL_MATCH_NOTIFY,
		notifications: true,
	},
	{
		key: LENS_SERIAL_MATCH_NOTIFY_KEY,
		label: t("imageInfoSandbox_setting_notify_lens_serial_match"),
		type: "checkbox",
		default: DEFAULT_SERIAL_MATCH_NOTIFY,
		notifications: true,
	},
	{
		key: OVERSIZE_KEY,
		label: t("imageInfoSandbox_setting_oversize_factor"),
		type: "number",
		default: String(DEFAULT_OVERSIZE_FACTOR),
	},
	{
		key: LARGE_FILE_KEY,
		label: t("imageInfoSandbox_setting_large_file"),
		type: "number",
		default: String(DEFAULT_LARGE_FILE_KB),
	},
];
