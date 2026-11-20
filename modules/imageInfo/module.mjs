//@ts-check
"use strict";

// modules/imageInfo/module.mjs
// The module description without DOM (see halloWorld/module.mjs) — shared by the element (imageInfo.mjs, the
// status of the recording) and the background part. The listing of the images of the page is imageInfoSandbox
// (sandbox-modules/imageInfoSandbox): the core asks the background part of this module for it (imageInfo.getPage
// in SANDBOX_CAPABILITIES of base.mjs — it relies on MODULE_NAME and the messages below, tests/sandbox.test.mjs
// checks they are the same).
import { getTagName, ModeSpecification, NOT_DISABLED_SPEC, PAGE_ACCESS_PERMISSIONS, WEBREQUEST_PERMISSIONS, t } from "../../sdk.mjs";
import { MAX_ENTRIES, MAX_XMP_ENTRIES } from "./metadata.mjs";
import { MAX_METADATA_CHARS } from "./records.mjs";

export const MODULE_NAME = "imageInfo";
export const TAG = getTagName(MODULE_NAME); // "extension-image-info"
export const DESCRIPTION = t("imageInfo_description");

// The headers are recorded while any page loads its images, as long as the module is not turned off — the
// status concerns all pages, not the current one, hence no WEB_PAGE_SPEC.
export const ACTIVATION_SPEC = NOT_DISABLED_SPEC;
/** @type {Types.ModuleDescriptor['DEFAULT_ACTIVATION_MODE']} */
export const DEFAULT_ACTIVATION_MODE = "background";
// The "On click of the main extension button" mode: the images of the page are listed only when the user clicks the
// extension button (api.activation.onIconClick() — the popup opens, or the button opens the dashboard), in the active tab
// of the window of the click; imageInfo.getPage then gives that listing (with the headers of its images as they are
// recorded) until the tab loads another page — never lists the frames of the page by itself. The headers are recorded
// while the pages load the images in this mode too: they cannot be had later, and the listing of the click needs them.
export const ICON_CLICK_SPEC = new ModeSpecification("icon_click");
// The element is only the status with the permission button — on the Settings page next to the settings of
// the module. The listing (imageInfoSandbox) is in the side panel and sends the user here for the permissions.
/** @type {Types.ModuleDescriptor['DEFAULT_DISPLAY_LOCATION']} */
export const DEFAULT_DISPLAY_LOCATION = "options";
/** @type {Types.ModuleDescriptor['DEFAULT_OUTPUT_ELEMENT']} */
export const DEFAULT_OUTPUT_ELEMENT = "block";
/** @type {Types.ModuleDescriptor['DEFAULT_SHOW_HEADING']} */
export const DEFAULT_SHOW_HEADING = false;

/** @type {string[]} */
export const STYLES = [new URL("./imageInfo.css", import.meta.url).href];

// Firefox? By the scheme of the extension's own address (like filterResponseData), not by chrome.webRequest,
// which is missing without the permission in both browsers.
/** @type {Functions.ImageInfo.Module.isFirefox} */
export function isFirefox() {
	try {
		return chrome.runtime.getURL("").startsWith("moz-extension:");
	} catch {
		return false;
	}
}

// Reading the responses of images while they load (Firefox, webRequest.filterResponseData()): a blocking
// listener and the filter of the response.
/** @type {Types.PermissionSet} */
export const CAPTURE_PERMISSIONS = {
	permissions: ["webRequest", "webRequestBlocking", /** @type {chrome.runtime.ManifestPermission} */ ("webRequestFilterResponse")],
	origins: ["<all_urls>"],
};

// The headers: WEBREQUEST_PERMISSIONS; the listing of the frames of the page and reading the files from the
// cache: PAGE_ACCESS_PERMISSIONS (scripting); in Firefox reading other origins while loading: CAPTURE_PERMISSIONS.
/** @type {Types.PermissionSet[]} */
export const USES_PERMISSIONS = [WEBREQUEST_PERMISSIONS, PAGE_ACCESS_PERMISSIONS, ...(isFirefox() ? [CAPTURE_PERMISSIONS] : [])];

// Recording the headers of images (a checkbox, on by default).
export const HEADERS_KEY = "recordHeaders";
export const DEFAULT_HEADERS = true;
// Firefox: reading the files of other origins while they load (a checkbox, off by default — every image of
// every page then passes through the extension).
export const CAPTURE_KEY = "captureOnLoad";
export const DEFAULT_CAPTURE = false;

// The most bytes of one response read while it loads (the beginning — then the filter lets the rest go
// straight to the page).
export const CAPTURE_MAX_BYTES = 2 * 1024 * 1024;

// The limits of one listing of a frame (collectFrame.mjs).
/** @type {Types.ImageInfo.Limits} */
export const LIMITS = Object.freeze({
	maxElements: 20000,
	maxUsages: 3000,
	cssTimeMs: 1500,
	maxFiles: 300,
	maxFileBytes: 16 * 1024 * 1024,
	fileTimeMs: 4000,
	totalTimeMs: 10000,
	concurrency: 4,
});

// The limits of the metadata of one file — settings of the module (number fields): the most entries of one file
// (metadata.mjs), the most entries of one XMP packet (metadata.mjs) and the most KiB of JSON (1 KiB = 1024
// characters) of the metadata stored with a record — read while loading (Firefox) or downloaded once more
// (compactMetadata() of records.mjs; the metadata the frames read from the cache is not stored). Over a limit
// the rest is left out and the listing of imageInfoSandbox says so (the warning "limit"). A changed limit
// applies to the files read after the change — the metadata already stored with the records stays as it is.
/** @type {Readonly<Record<'maxEntries' | 'maxXmpEntries' | 'maxStoredKiB', Types.ImageInfo.LimitSetting>>} */
export const METADATA_LIMITS = Object.freeze({
	maxEntries: { key: "metadataMaxEntries", default: MAX_ENTRIES, min: 100, max: 20000 },
	maxXmpEntries: { key: "metadataMaxXmpEntries", default: MAX_XMP_ENTRIES, min: 10, max: 5000 },
	maxStoredKiB: { key: "metadataMaxStoredKiB", default: MAX_METADATA_CHARS / 1024, min: 16, max: 1024 },
});

// A limit from the stored value (a "number" field stores text): empty or not a positive number = the default,
// otherwise a whole number in the range of the limit.
/** @type {Functions.ImageInfo.Module.resolveLimit} */
export function resolveLimit(value, limit) {
	const number = Math.round(Number(value));
	if (!Number.isFinite(number) || number <= 0) return limit.default;
	return Math.min(limit.max, Math.max(limit.min, number));
}

// The settings of the module as the background part and the element use them.
/** @type {Functions.ImageInfo.Module.loadConfig} */
export async function loadConfig(api) {
	const { maxEntries, maxXmpEntries, maxStoredKiB } = METADATA_LIMITS;
	const [headers, capture, entries, xmpEntries, storedKiB] = await Promise.all([
		api.settings.get(HEADERS_KEY, DEFAULT_HEADERS),
		api.settings.get(CAPTURE_KEY, DEFAULT_CAPTURE),
		api.settings.get(maxEntries.key, /** @type {unknown} */ (null)),
		api.settings.get(maxXmpEntries.key, /** @type {unknown} */ (null)),
		api.settings.get(maxStoredKiB.key, /** @type {unknown} */ (null)),
	]);
	return {
		headers: headers !== false,
		capture: isFirefox() && capture === true,
		metadata: { maxEntries: resolveLimit(entries, maxEntries), maxXmpEntries: resolveLimit(xmpEntries, maxXmpEntries) },
		maxStoredChars: resolveLimit(storedKiB, maxStoredKiB) * 1024,
	};
}

// The permissions the settings need: the page access always (the listing), webRequest for the headers,
// the filter of responses for reading them while loading.
/** @type {Functions.ImageInfo.Module.neededPermissions} */
export function neededPermissions(config) {
	const sets = [PAGE_ACCESS_PERMISSIONS, ...(config.headers ? [WEBREQUEST_PERMISSIONS] : []), ...(config.capture ? [CAPTURE_PERMISSIONS] : [])];
	return {
		permissions: [...new Set(sets.flatMap((set) => set.permissions || []))],
		origins: [...new Set(sets.flatMap((set) => set.origins || []))],
	};
}

// The part of the permissions that is not granted yet (null = all granted). The button requests only that —
// computed in advance: permissions.request() must happen directly in the click handler (Firefox does not
// carry the user gesture over an await).
/** @type {Functions.ImageInfo.Module.missingPermissions} */
export async function missingPermissions(api, needed) {
	/** @type {Required<Types.PermissionSet>} */
	const missing = { permissions: [], origins: [] };
	for (const permission of needed.permissions || []) {
		if (!(await api.permissions.contains({ permissions: [permission] }))) missing.permissions.push(permission);
	}
	for (const origin of needed.origins || []) {
		if (!(await api.permissions.contains({ origins: [origin] }))) missing.origins.push(origin);
	}
	return missing.permissions.length > 0 || missing.origins.length > 0 ? missing : null;
}

// Extension page → background part: the listing of the images of the page in the tab ({ tabId } → { page }).
export const PAGE_MESSAGE = "IMAGE_INFO_PAGE";
// Background part → extension pages: new records of the tab ({ tabId }) — the core passes it on to
// imageInfoSandbox as the event "records" of the listener imageInfo.onChange.
export const UPDATED_MESSAGE = "IMAGE_INFO_UPDATED";
// Element → background part: the status (the listeners and the permissions).
export const STATUS_MESSAGE = "IMAGE_INFO_STATUS";
// Extension page → background part: download an image of the tab once more ({ tabId, url } → { ok } or { error }).
export const FETCH_MESSAGE = "IMAGE_INFO_FETCH";
// How long the download may take, and how much of the file is read (the rest is not downloaded).
export const FETCH_TIMEOUT_MS = 30000;
// Extension page → background part: the whole file of an image the listing of the tab showed, for saving ({ tabId, url,
// anonymous } → { data (base64), contentType, fileName, source } or { error }) — from what the browser already has
// ("browser"), otherwise downloaded once more ("network").
export const SAVE_MESSAGE = "IMAGE_INFO_SAVE";
// Extension page → background part: the whole file of an image the listing of the tab showed, for its thumbnail ({ tabId,
// url, anonymous, download } → { data (base64), contentType, source } or { error }) — only from what the browser already
// has, or with download once more (the headers and the metadata go to the records of the tab like with FETCH_MESSAGE).
export const READ_MESSAGE = "IMAGE_INFO_READ";
// Extension page → background part: remove an image the listing of the tab showed from the page ({ tabId, url } → { removed }
// — how many of its usages, or { error }) — the frames that use it (removeImage() of collectFrame.mjs).
export const REMOVE_MESSAGE = "IMAGE_INFO_REMOVE";
// The largest file that is saved or shown (it travels as base64 in messages).
export const SAVE_MAX_BYTES = 32 * 1024 * 1024;
// Extension page → background part: keep reporting which images of the tab are visible and which one is under the pointer
// ({ tabId }, the listener imageInfo.onView asks again every few seconds while it runs) — the frames of the last listing of
// the tab (watchView() of collectFrame.mjs) report it for VIEW_LEASE_MS more. A frame reports to the background part
// (VIEW_REPORT_MESSAGE of collectFrame.mjs), the background part passes it on to the extension pages as VIEW_MESSAGE
// ({ tabId, frameId, visible, hovered } — the keys of the images). Firefox delivers no message at all (not even one of the
// background part) to an extension page embedded in a tab (verified in Firefox 157) — the floating window asks for the last
// reports of the frames of the tab instead (VIEW_STATE_MESSAGE: { tabId } → { frames: [{ frameId, visible, hovered }] }).
export const WATCH_MESSAGE = "IMAGE_INFO_WATCH";
export const VIEW_MESSAGE = "IMAGE_INFO_VIEW";
export const VIEW_STATE_MESSAGE = "IMAGE_INFO_VIEW_STATE";
// How long a frame keeps reporting after the last WATCH_MESSAGE (longer than the interval of the listener in base.mjs, so
// that one late request does not stop it; a closed listing stops it at the latest after this time).
export const VIEW_LEASE_MS = 15000;
// Extension page → background part: the marks of the properties of the images of the tab on the page itself ({ tabId, images,
// source } → { marked } — how many elements have one, or { error }; imageInfoSandbox through the core, imageInfo.markImages):
// the frames of the last listing of the tab (markImages() of collectFrame.mjs) show a badge with the icons over every element
// of a marked image and its details under the mouse pointer — for MARK_LEASE_MS more. The listing sends them again every few
// seconds while it is shown (an empty list takes them away); a closed listing leaves nothing in the page.
export const MARK_MESSAGE = "IMAGE_INFO_MARK";
export const MARK_LEASE_MS = 15000;

// The file extensions of the image types (when the name of the file has none).
/** @type {Record<string, string>} */
const IMAGE_EXTENSIONS = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/apng": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
	"image/jxl": "jxl",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"image/tiff": "tiff",
	"image/heic": "heic",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

// The name of the saved file: the last part of the path of an http(s) address (without the characters a file name cannot
// have), otherwise "image"; the extension by the type when the name has none.
/** @type {Functions.ImageInfo.Module.imageFileName} */
export function imageFileName(url, contentType) {
	const extension = IMAGE_EXTENSIONS[(contentType || "").split(";")[0].trim().toLowerCase()] ?? null;
	let name = "";
	if (/^https?:/i.test(url)) {
		try {
			name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
		} catch {
			name = "";
		}
	}
	name = [...name]
		.map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '\\/:*?"<>|'.includes(char) ? "_" : char))
		.join("")
		.replace(/^[.\s]+|[.\s]+$/g, "")
		.slice(0, 150);
	if (!name) name = "image";
	if (extension && !/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${extension}`;
	return name;
}

/** @type {Types.SettingField[]} */
export const SETTINGS_SCHEMA = [
	{
		key: HEADERS_KEY,
		label: t("imageInfo_setting_headers"),
		type: "checkbox",
		default: DEFAULT_HEADERS,
	},
	...(isFirefox()
		? [
				/** @type {Types.SettingField} */ ({
					key: CAPTURE_KEY,
					label: t("imageInfo_setting_capture"),
					type: "checkbox",
					default: DEFAULT_CAPTURE,
				}),
			]
		: []),
	{
		key: METADATA_LIMITS.maxEntries.key,
		label: t("imageInfo_setting_max_entries", String(METADATA_LIMITS.maxEntries.min), String(METADATA_LIMITS.maxEntries.max)),
		type: "number",
		default: String(METADATA_LIMITS.maxEntries.default),
	},
	{
		key: METADATA_LIMITS.maxXmpEntries.key,
		label: t("imageInfo_setting_max_xmp_entries", String(METADATA_LIMITS.maxXmpEntries.min), String(METADATA_LIMITS.maxXmpEntries.max)),
		type: "number",
		default: String(METADATA_LIMITS.maxXmpEntries.default),
	},
	{
		key: METADATA_LIMITS.maxStoredKiB.key,
		label: t("imageInfo_setting_max_stored_kib", String(METADATA_LIMITS.maxStoredKiB.min), String(METADATA_LIMITS.maxStoredKiB.max)),
		type: "number",
		default: String(METADATA_LIMITS.maxStoredKiB.default),
	},
];
