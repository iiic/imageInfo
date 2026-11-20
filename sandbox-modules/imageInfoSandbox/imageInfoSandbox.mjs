//@ts-check
"use strict";

// sandbox-modules/imageInfoSandbox/imageInfoSandbox.mjs
//
// The listing of all images of the current page with everything that can be found out about them — an UPLOADED module
// (a package of JS modules) that the extension brings itself (BUNDLED_SANDBOX_MODULES in base.mjs): the core installs it
// the same way as a module the user uploads, its code runs only in the sandbox. Every image of the page (an <img>, a
// <picture>, an image from CSS, an icon, an image the page loaded without using it in an element) with:
// - where the page uses it (the element, alt, srcset, the rendered and the natural size, the CSS property, the frame) —
//   an <img> or an <input type="image"> without a text description has the badge "no text alternative";
// - how it loaded (the status, from the cache, the IP address, the duration and the sizes from Resource Timing);
// - the HTTP response headers — Content-Type, Content-Length, Last-Modified, the caching, and whatever the server sends
//   about the image (Image-Width, Camera-Model, X-Imgix-…), the ones that concern the image first;
// - the metadata of its file — EXIF (camera, lens, exposure, the date, GPS with a link to a map), XMP, IPTC, the ICC
//   profile and the structure of the format (the size, the bit depth, the quality of a JPEG, the frames of an animation).
//
// Nothing is downloaded again. The headers are recorded by the background part of imageInfo while the page loads the
// images (webRequest), the metadata is read from what the browser already has — the HTTP cache of the page (only images
// of the same origin as their frame — the browser allows reading the cache without the network only for those), data:
// and blob: addresses, in Firefox also the responses read while they loaded (a setting of imageInfo). An image of another
// origin in Chrome therefore has its headers, but not its metadata — the listing says why.
//
// The images are not the module's own data — the background part of imageInfo lists them for it through functions outside
// the sandbox (CAPABILITIES in module.mjs): imageInfo.getPage (the frames of the tab joined with the records of the
// requests) and the listener imageInfo.onChange ("records" — the page loaded more images, "status" — the settings or the
// permissions changed). In the "Start automatically, …" modes (LIVE_SPEC) the listing follows the page by itself (also
// another tab or a new address, api.tabs.onChange); in the other modes it lists the page when it is shown and with the
// Refresh button — in the side panel also after another tab or a new address (the side panel outlives a switch of tabs,
// the listing of another tab would be stale there; a page still loading then is listed again in a moment). In the mode
// "On click of the main extension button" (ICON_CLICK_SPEC) outside the popup — which itself opens by that click — it lists
// the page only after a click on the extension button (api.activation.onIconClick(), also the click that opened the surface
// a moment ago) and with the Refresh button, and follows nothing meanwhile; a note says so. When imageInfo itself is in that
// mode, imageInfo.getPage gives the listing of its last click (a page without one: the error "notClicked"). The permissions
// are granted in Settings at imageInfo (a sandboxed module cannot ask for them) — the buttons here open Settings (options.open).
//
// The button "Remove from the document" in the details of an image removes it from the page in the tab (imageInfo.removeImage —
// the frames of the page remove its elements, an image from CSS is turned off); the listing keeps it with the badge "removed"
// (also with "Hide images not on the page") until the page uses it again or is reloaded.
//
// The button "Block the image permanently" (an http(s) image) hands its address over to the module declarativeNetRequest
// through the core (imageInfo.blockImage): it goes into the rule "Image info sandbox - blocked images" there, and the browser
// then does not load the image from that address on any page — until the user changes or removes the rule in Settings. The
// note under the buttons says whether the browser now blocks it, or why not (the module turned off, its permission, the rule).
// While declarativeNetRequest is not in the module list or is turned off (and no client runs it instead — blockReason of
// imageInfo.getPage) the button is disabled and its tip says why; turning it on or off is a "status" of imageInfo.onChange. An
// extension without the module (a standalone extension of imageInfo — blockReason "rulesUnavailable") has no such button.
//
// The button "Record permanently" (before "Save" / "Download") keeps a record of the image after the tab closes: a snapshot of
// what the listing knows about it (the address, where the page uses it, the loading, the headers, the metadata) with the page
// and the time goes into the shared IndexedDB of the core (this.api.data.log() under the key of the image — the module's own
// data, no function outside the sandbox). The column "Record permanently" of the notices does the same by itself for the
// images with a property (by default the serial number of the camera and that of the lens) — once for an image, never one whose record
// the user removed (DISMISSED_STATE_KEY). The section "Permanently recorded images (N)" above the toolbar (collapsed, only
// while there is a record) lists the newest MAX_PERMANENT_RECORDS of them — on any page, also one that is not a web page —
// with the same details as an image of the page and the button that removes the record; the line of a recorded image of the
// page has the badge 📌. A change of the records is announced to the other surfaces through api.state (RECORDS_STATE_KEY).
// The records are merged by the serial number: a record of an image with a serial number of the camera (without one, of the
// lens) is stored under the key of that serial number (permanentRecordKey() of format.mjs), and the records of one serial
// number are one group of the section ("Camera S/N … — N images", "Lens S/N … — N images").
//
// The matches of the serial number: the listing looks up the serial numbers of the camera and of the lens of the images of the
// page among the permanent records (api.data.findByKey() under the key of the serial number, plus the records the section has
// loaded) — an image whose serial number of the camera (of the lens) is a serial number of the camera (of the lens) of a record
// of another image from another page (serialMatches() of format.mjs: the same camera or lens elsewhere, e.g. on another
// website) has the badge "S/N match" ("Lens S/N match") and the section "Serial number match" in its details with those
// records. With the setting "Notify about a found match of the camera serial number" (SERIAL_MATCH_NOTIFY_KEY), and the same of
// the lens (LENS_SERIAL_MATCH_NOTIFY_KEY), a silent notification says so about the matches of that kind — once for every image
// and serial number of a document (MATCH_STATE_KEY, shared by all surfaces), a click on it opens the images like a click on a
// notification of the notices. With "Record permanently" of the serial number (the default for both kinds) automatic recording
// records the matching image too — into the group of its serial number.
//
// The checkbox "Clean dynamically" (a setting of the module, on by default) is for web apps that change the address without
// loading a new document (Reddit, Facebook — history.pushState()): the images the document keeps from the previous address
// would pile up in the listing. After such a change (the same tab and document — Page.documentAt, another address without
// the fragment) the listing leaves out the images of its last listing before it, except those the page then uses in more
// places than before (format.mjs: nextCleaning(), isCleared()); the summary says how many. It needs a listing before the
// change and one after it — the side panel or the floating window, not a popup opened anew.
//
// The notices about some properties of an image (a setting of the module — the table in Settings, NOTICES_KEY in module.mjs):
// the place of the shot, a camera the metadata name, no text alternative, the date and time of the shot and a file of another
// type than its Content-Type says each have their badge (on by default — off, the listing shows it nowhere), "Never hide"
// (the listing keeps such an image even when it would leave it out as a small one, one not on the page or by cleaning
// dynamically) and "Send a notification" — once the listing
// finds such an image in the document, a silent notification (api.notifications.show()) says how many images of the document
// have the properties. Every image and property is announced once for a document: the announced ones are remembered in
// api.state, shared by all surfaces (another listing of the same document — a popup opened again, a return to the
// tab, the floating window next to the side panel — announces nothing again); the notifications of a document have the
// same tag, a newer one replaces the older one. A click on the notification (api.notifications.onClick()) in the side panel
// or the floating window brings its tab to the front (tabs.activate) and, once the listing lists that document, expands its
// images — shown even when they would be hidden — and scrolls the page to the first of them (api.ui.scrollIntoView()).
// Only a listing that is shown reads the metadata — in the side panel and the floating window it follows the page by itself. The permission for notifications is granted in Settings under the table.
//
// "Show on the page" (the fourth column of the table) marks the images on the page itself (imageInfo.markImages): over every
// element of an image the page uses with such a property a badge with the icons of its properties (the badges of the listing
// — 📷, 🗺, 📅, ©, 🛠 —, a property without its own icon 🛈), the tip under the mouse pointer says what they are and the values
// (the core adds the name of the module). The badges are the work of the frames of the page (modules/imageInfo/collectFrame.mjs,
// a closed shadow root); the listing sends the marks after every change and again every MARK_RENEW_MS while it is shown —
// once it closes, the frames take them away after a while.
//
// In every mode, while the listing is shown, the line of an image the page shows in the viewport right now has a light
// background and the line of the image under the mouse pointer (on a touch screen the one tapped last) a stronger one — the
// listener imageInfo.onView (the frames of the page follow the scrolling and the pointer for imageInfo, see
// modules/imageInfo/collectFrame.mjs).
//
// Everything from the page and its images is foreign text (the metadata, the headers, alt): it goes into the output only
// through textContent, never as HTML. Links (the image, the map) open in a new tab — the sandbox frame may open a link
// itself from a click (allow-popups-to-escape-sandbox). The details of an image are built only when it is expanded — a
// page can have hundreds of images.
//
// The package: imageInfoSandbox.mjs (the element), module.mjs (the description without DOM), format.mjs (the values as
// text, sorting, searching — without DOM), imageInfoSandbox.css and messages.json (the texts in all UI languages) — a new
// file belongs in BUNDLED_SANDBOX_MODULES too (tests/manifests.test.mjs checks it).
import { BaseElement, registerModule, followsActiveTab, getUiLocale, t, tp } from "../../sdk.mjs";
import {
	MODULE_NAME,
	TAG,
	DESCRIPTION,
	ACTIVATION_SPEC,
	DEFAULT_ACTIVATION_MODE,
	DEFAULT_DISPLAY_LOCATION,
	DEFAULT_OUTPUT_ELEMENT,
	DEFAULT_SHOW_HEADING,
	STYLES,
	DEPENDS_ON,
	CAPABILITIES,
	LIVE_SPEC,
	VISIBLE_ONLY_SPEC,
	ICON_CLICK_SPEC,
	SORT_STATE_KEY,
	NOTICE_STATE_KEY,
	NOTICE_OPEN_MS,
	NOTICE_MAX_IMAGES,
	SORT_ORDERS,
	DEFAULT_SORT,
	REFRESH_DELAY_MS,
	LOADING_RETRIES,
	IGNORE_SMALL_KEY,
	DEFAULT_IGNORE_SMALL,
	HIDE_UNUSED_KEY,
	DEFAULT_HIDE_UNUSED,
	CLEAN_DYNAMIC_KEY,
	DEFAULT_CLEAN_DYNAMIC,
	ONLY_IMPORTANT_KEY,
	DEFAULT_ONLY_IMPORTANT,
	SMALL_WIDTH_KEY,
	SMALL_HEIGHT_KEY,
	DEFAULT_SMALL_SIZE,
	NOTICES_KEY,
	NOTICE_TAGS,
	DEFAULT_NOTICES,
	TRACKING_PIXEL_SIZE,
	OVERSIZE_KEY,
	DEFAULT_OVERSIZE_FACTOR,
	LARGE_FILE_KEY,
	DEFAULT_LARGE_FILE_KB,
	SETTINGS_SCHEMA,
	MARK_RENEW_MS,
	MARK_LIMITS,
	MAX_PERMANENT_RECORDS,
	RECORDS_STATE_KEY,
	DISMISSED_STATE_KEY,
	MAX_SERIAL_RECORDS,
	MATCH_NOTIFY_KEYS,
	DEFAULT_SERIAL_MATCH_NOTIFY,
	SERIAL_KINDS,
	MATCH_STATE_KEY,
	MATCH_NOTIFY_LINES,
	resolveSmallSize,
	resolveNotices,
	resolveOversizeFactor,
	resolveLargeFileKB,
	noticeTagText,
	noticeIcon,
} from "./module.mjs";
import {
	fileName,
	formatBytes,
	formatCount,
	formatTime,
	imageBytes,
	imageDimensions,
	imageFormat,
	isImageHeader,
	isImagePage,
	isSmallImage,
	isRemoved,
	canFetch,
	canBlock,
	canSaveFromBrowser,
	metadataOf,
	matchesFilter,
	nextCleaning,
	isCleared,
	isKept,
	noticeTags,
	noticeContext,
	markedImages,
	clipText,
	serialNumber,
	oversizedBy,
	noticeDocument,
	announcedKeys,
	rememberNotices,
	newNotices,
	countNotices,
	announcedImages,
	readNoticeClick,
	sortImages,
	typeMismatch,
	fromCache,
	notLoaded,
	noStore,
	mapUrl,
	permanentRecord,
	readRecordEntry,
	recordCandidates,
	recordPageLabel,
	dismissedKeys,
	dismissRecord,
	serialIds,
	serialRecordKey,
	serialRefKey,
	imageGroupSerial,
	permanentRecordKey,
	recordSerials,
	serialMatches,
	matchesOfKinds,
	newMatches,
	matchSummary,
	groupRecords,
	recordSite,
} from "./format.mjs";

// The functions outside the sandbox (declared in module.mjs).
const GET_PAGE = "imageInfo.getPage";
const FETCH_IMAGE = "imageInfo.fetchImage";
const SAVE_IMAGE = "imageInfo.saveImage";
const READ_IMAGE = "imageInfo.readImage";
const REMOVE_IMAGE = "imageInfo.removeImage";
const BLOCK_IMAGE = "imageInfo.blockImage";
const MARK_IMAGES = "imageInfo.markImages";
// The prefix of the labels of the buttons that act by the checkbox "anonymously" while it is checked (only the look).
const ANONYMOUS_PREFIX = "🕵 ";
// How many thumbnails the listing keeps (blob: addresses of their files); the oldest go first.
const MAX_THUMBNAILS = 40;
const ON_CHANGE = "imageInfo.onChange";
const ON_VIEW = "imageInfo.onView";
const OPEN_OPTIONS = "options.open";
const ACTIVATE_TAB = "tabs.activate";

// The groups of the metadata whose name is a technical term the same in every language; the others have a text.
/** @type {Readonly<Record<string, string>>} */
const GROUP_NAMES = {
	jfif: "JFIF",
	exif: "EXIF",
	gps: "GPS",
	interop: "EXIF Interoperability",
	mpf: "MPF (Multi-Picture Format)",
	xmp: "XMP",
	iptc: "IPTC",
	photoshop: "Photoshop",
	icc: "ICC",
	adobe: "Adobe",
	ducky: "Ducky (Save for Web)",
	heif: "HEIF / AVIF",
	svg: "SVG",
};

/** @type {Readonly<Record<string, () => string>>} */
const GROUP_TEXTS = {
	file: () => t("imageInfoSandbox_group_file"),
	animation: () => t("imageInfoSandbox_group_animation"),
	thumbnail: () => t("imageInfoSandbox_group_thumbnail"),
	text: () => t("imageInfoSandbox_group_text"),
};

/** @type {Readonly<Record<Types.ImageInfo.UsageKind, () => string>>} */
const USAGE_KINDS = {
	img: () => t("imageInfoSandbox_usage_img"),
	input: () => t("imageInfoSandbox_usage_input"),
	svg: () => t("imageInfoSandbox_usage_svg"),
	poster: () => t("imageInfoSandbox_usage_poster"),
	icon: () => t("imageInfoSandbox_usage_icon"),
	preload: () => t("imageInfoSandbox_usage_preload"),
	css: () => t("imageInfoSandbox_usage_css"),
};

/** @type {Readonly<Record<Types.ImageInfo.FileError, (detail: string) => string>>} */
const FILE_ERRORS = {
	crossOrigin: () => t("imageInfoSandbox_metadata_cross_origin"),
	notCached: () => t("imageInfoSandbox_metadata_not_cached"),
	csp: () => t("imageInfoSandbox_metadata_csp"),
	status: (detail) => t("imageInfoSandbox_metadata_status", detail),
	tooMany: () => t("imageInfoSandbox_metadata_too_many"),
	timeLimit: () => t("imageInfoSandbox_metadata_time_limit"),
	failed: (detail) => t("imageInfoSandbox_metadata_failed", detail),
};

// Why the browser does not block an image the button "Block the image permanently" put into the rule (the title of the rule).
/** @type {Readonly<Record<Types.NetworkBlockProblem, (title: string) => string>>} */
const BLOCK_PROBLEMS = {
	permission: (title) => t("imageInfoSandbox_block_permission", title),
	rule: (title) => t("imageInfoSandbox_block_inactive", title),
	module: () => t("imageInfoSandbox_block_rules_disabled"),
	browser: (title) => t("imageInfoSandbox_block_rejected", title),
};

// Why the core does not ask declarativeNetRequest at all (blockReason of imageInfo.getPage, the reason of imageInfo.blockImage) —
// the tip of the disabled button "Block the image permanently". Not "rulesUnavailable": the listing then has no such button.
/** @type {Readonly<Record<Exclude<Types.SandboxImageInfoBlockReason, "rulesUnavailable">, () => string>>} */
const BLOCK_REASONS = {
	rulesNotListed: () => t("imageInfoSandbox_block_rules_not_listed"),
	rulesDisabled: () => t("imageInfoSandbox_block_rules_disabled"),
};

/** @type {Readonly<Record<Enums.ImageInfoSandbox.SortOrder, () => string>>} */
const SORT_LABELS = {
	page: () => t("imageInfoSandbox_sort_page"),
	size: () => t("imageInfoSandbox_sort_size"),
	name: () => t("imageInfoSandbox_sort_name"),
	type: () => t("imageInfoSandbox_sort_type"),
};

// Type checking sees this.api of BaseElement in sdk.mjs; in the sandbox it is Types.SandboxModuleApi, which has
// capabilities.
/** @type {Functions.ImageInfoSandbox.Element.sandboxApi} */
function sandboxApi(element) {
	return /** @type {Types.SandboxModuleApi} */ (/** @type {unknown} */ (element.api));
}

// Firefox does not load a blob: address of the opaque origin of the sandbox frame ("blob:null/…") into an <img> (verified in
// Firefox 157 — the image fails), Chrome does; a data: address works in both. A small PNG decides once which one the
// thumbnails use (a blob: address costs no copy of the base64 text).
const PROBE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** @type {Promise<boolean> | null} */
let blobImages = null;

/** @type {Functions.ImageInfoSandbox.Element.canShowBlobImages} */
function canShowBlobImages() {
	if (!blobImages) {
		blobImages = new Promise((resolve) => {
			const url = URL.createObjectURL(new Blob([fromBase64(PROBE_PNG)], { type: "image/png" }));
			const img = new Image();
			const done = (/** @type {boolean} */ works) => {
				URL.revokeObjectURL(url);
				resolve(works);
			};
			img.addEventListener("load", () => done(img.naturalWidth > 0));
			img.addEventListener("error", () => done(false));
			setTimeout(() => done(false), 2000);
			img.src = url;
		});
	}
	return blobImages;
}

/** @type {Functions.ImageInfoSandbox.Element.fromBase64} */
function fromBase64(data) {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

/** @type {Functions.ImageInfoSandbox.Element.errorText} */
function errorText(err) {
	return err instanceof Error ? err.message : String(err);
}

// The key of a group of the metadata of an image (its expanded state).
/** @type {Functions.ImageInfoSandbox.Element.groupKey} */
function groupKey(imageKey, groupId) {
	return `${imageKey}\n${groupId}`;
}

// An element with a class and a text.
/** @type {Functions.ImageInfoSandbox.Element.create} */
function create(tag, className = "", text = "") {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text) element.textContent = text;
	return element;
}

// An http(s) address as a link to a new tab, anything else as text.
/** @type {Functions.ImageInfoSandbox.Element.createUrlNode} */
function createUrlNode(url, text = url) {
	if (!/^https?:\/\//i.test(url)) return create("code", "iis-url", text);
	const link = document.createElement("a");
	link.href = url;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.className = "iis-url";
	link.textContent = text;
	return link;
}

// A section of the details: a heading and its content (a <div> — mvp.css lays a <section> out as a centered row).
/** @type {Functions.ImageInfoSandbox.Element.section} */
function section(title, ...content) {
	const box = create("div", "iis-section");
	box.append(create("h4", "iis-section__title", title), ...content);
	return box;
}

// A definition list of the rows [term, value]; a row with an empty value is left out.
/** @type {Functions.ImageInfoSandbox.Element.definitions} */
function definitions(rows) {
	const list = create("dl", "iis-definitions");
	for (const [term, value] of rows) {
		if (value === null || value === undefined || value === "") continue;
		const dd = create("dd");
		dd.append(value);
		list.append(create("dt", "", term), dd);
	}
	return list;
}

// A table of [name, value] rows (the headers, the entries of a group of the metadata).
/** @type {Functions.ImageInfoSandbox.Element.entriesTable} */
function entriesTable(rows, highlight) {
	const table = create("table", "iis-table");
	const body = document.createElement("tbody");
	for (const [name, value] of rows) {
		const row = document.createElement("tr");
		if (highlight && highlight(name)) row.className = "iis-table__row--highlight";
		row.append(create("th", "", name), create("td", "", value));
		body.appendChild(row);
	}
	table.appendChild(body);
	return table;
}

/** @type {Functions.ImageInfoSandbox.Element.yesNo} */
const yesNo = (value) => (value === null ? null : value ? t("imageInfoSandbox_yes") : t("imageInfoSandbox_no"));

/** @type {Functions.ImageInfoSandbox.Element.size} */
const size = (width, height) => `${formatCount(width)} × ${formatCount(height)}`;

// The short facts of an image for its line: the format, the size in pixels, the size of the file.
/** @type {Functions.ImageInfoSandbox.Element.facts} */
function facts(image) {
	const dimensions = imageDimensions(image);
	const bytes = imageBytes(image);
	return [imageFormat(image), dimensions ? size(dimensions[0], dimensions[1]) : null, bytes !== null ? formatBytes(bytes) : null].filter(Boolean).join(" · ");
}

// A serial number with its kind in a few words: "Camera S/N …", "Lens S/N …".
/** @type {Functions.ImageInfoSandbox.Element.serialLabel} */
function serialLabel({ kind, serial }) {
	return t(kind === "lens" ? "imageInfoSandbox_serial_lens" : "imageInfoSandbox_serial_camera", serial);
}

// The badge of a match of the serial number of each kind: its text and its title (the lines of the matches).
/** @type {Readonly<Record<Enums.ImageInfoSandbox.SerialKind, [string, string]>>} */
const MATCH_CHIPS = {
	camera: ["imageInfoSandbox_chip_serial_match", "imageInfoSandbox_chip_serial_match_title"],
	lens: ["imageInfoSandbox_chip_lens_serial_match", "imageInfoSandbox_chip_lens_serial_match_title"],
};

// The badges of an image for its line; ✓ — the listing has both its HTTP headers and the metadata of its file, 📷 — the
// metadata name the camera, 📅 — the date and time the photo was taken (created), 🗺 — the place of the shot (GPS
// coordinates or the place in words; the title says which), S/N — a serial number of the camera, "Lens S/N" — a serial number of
// the lens, © — the author
// or the copyright, 🛠 — the software, "no text alternative" — the page shows it without a text description
// (missingLabel()), and the others by noticeTags() of format.mjs. The badges of the properties with a notice only when
// their "Add a badge" is on.
/** @type {Functions.ImageInfoSandbox.Element.chips} */
function chips(image, notices, context) {
	const metadata = metadataOf(image);
	const summary = metadata ? metadata.summary : null;
	const tags = new Set(noticeTags(image, context).filter((tag) => notices[tag].badge));
	/** @type {[string, string, string?][]} */
	const list = [];
	if (tags.has("removed")) list.push(["removed", t("imageInfoSandbox_chip_removed")]);
	if (tags.has("complete")) list.push(["ok", "✓", t("imageInfoSandbox_chip_complete_title")]);
	if (summary && tags.has("camera")) list.push(["ok", "📷", `${t("imageInfoSandbox_summary_camera")}: ${summary.camera}`]);
	if (summary && tags.has("taken")) list.push(["ok", "📅", `${t("imageInfoSandbox_summary_taken")}: ${summary.taken}`]);
	if (summary && tags.has("place")) {
		const { gps, place } = summary;
		const where = [place, gps ? `${t("imageInfoSandbox_summary_gps")}: ${gps.latitude}, ${gps.longitude}` : null].filter(Boolean).join(" · ");
		list.push(["ok", "🗺", `${t("imageInfoSandbox_summary_place")}: ${where}`]);
	}
	if (tags.has("serial")) list.push(["warning", "S/N", t("imageInfoSandbox_chip_serial_title", serialNumber(image, "camera") ?? "")]);
	if (tags.has("lensSerial")) list.push(["warning", t("imageInfoSandbox_chip_lens_serial"), t("imageInfoSandbox_chip_lens_serial_title", serialNumber(image, "lens") ?? "")]);
	if (tags.has("exifThumbnail")) list.push(["warning", t("imageInfoSandbox_chip_exif_thumbnail"), t("imageInfoSandbox_chip_exif_thumbnail_title")]);
	if (summary && tags.has("copyright")) {
		const who = [summary.author ? `${t("imageInfoSandbox_summary_author")}: ${summary.author}` : null, summary.copyright ? `${t("imageInfoSandbox_summary_copyright")}: ${summary.copyright}` : null];
		list.push(["", "©", who.filter(Boolean).join(" · ")]);
	}
	if (summary && tags.has("software")) list.push(["", "🛠", `${t("imageInfoSandbox_summary_software")}: ${summary.software}`]);
	if (tags.has("failed")) list.push(["error", t("imageInfoSandbox_chip_error")]);
	if (tags.has("notLoaded")) list.push(["muted", t("imageInfoSandbox_chip_not_loaded")]);
	if (tags.has("mismatch")) list.push(["warning", t("imageInfoSandbox_chip_mismatch")]);
	if (tags.has("mixedContent")) list.push(["warning", t("imageInfoSandbox_chip_mixed_content"), t("imageInfoSandbox_chip_mixed_content_title")]);
	if (tags.has("trackingPixel")) list.push(["warning", t("imageInfoSandbox_chip_tracking_pixel"), t("imageInfoSandbox_chip_tracking_pixel_title", TRACKING_PIXEL_SIZE)]);
	const oversized = tags.has("oversized") ? oversizedBy(image, context.oversizeFactor) : null;
	if (oversized) list.push(["warning", t("imageInfoSandbox_chip_oversized"), t("imageInfoSandbox_chip_oversized_title", size(...oversized.file), size(...oversized.rendered))]);
	if (tags.has("largeFile")) list.push(["warning", t("imageInfoSandbox_chip_large_file"), t("imageInfoSandbox_chip_large_file_title", formatBytes(imageBytes(image) ?? 0), formatBytes(context.largeFileBytes))]);
	if (tags.has("noLabel")) list.push(["warning", t("imageInfoSandbox_chip_no_label"), t("imageInfoSandbox_chip_no_label_title")]);
	if (tags.has("noDimensions")) list.push(["muted", t("imageInfoSandbox_chip_no_dimensions"), t("imageInfoSandbox_chip_no_dimensions_title")]);
	if (tags.has("unused")) list.push(["muted", t("imageInfoSandbox_chip_unused")]);
	if (tags.has("crossOrigin")) list.push(["", t("imageInfoSandbox_chip_cross_origin")]);
	if (tags.has("fromCache")) list.push(["", t("imageInfoSandbox_chip_cache")]);
	if (tags.has("lazy")) list.push(["", t("imageInfoSandbox_chip_lazy")]);
	if (tags.has("animated")) list.push(["", t("imageInfoSandbox_chip_animated")]);
	if (tags.has("exif")) list.push(["info", "EXIF"]);
	if (tags.has("xmp")) list.push(["info", "XMP"]);
	if (tags.has("iptc")) list.push(["info", "IPTC"]);
	if (summary && summary.gps && tags.has("gps")) list.push(["info", "GPS"]);
	return list;
}

// The badges of chips() as the elements of a line (a badge that is only a sign has its text as the title and the label).
/** @type {Functions.ImageInfoSandbox.Element.chipsElement} */
function chipsElement(list) {
	const badges = create("span", "iis-item__chips");
	for (const [kind, text, title] of list) {
		const chip = badges.appendChild(create("span", `iis-chip${kind ? ` iis-chip--${kind}` : ""}`, text));
		if (title) {
			chip.title = title;
			chip.setAttribute("role", "img");
			chip.setAttribute("aria-label", title);
		}
	}
	return badges;
}

// The keys of the recorded images as one text — the list of the page is drawn again when they change (the badge 📌, the button).
/** @type {Functions.ImageInfoSandbox.Element.recordedSignature} */
function recordedSignature(recorded) {
	return [...recorded.keys()].sort().join("\n");
}

/** @type {Functions.ImageInfoSandbox.Element.summaryOf} */
const summaryOf = (image) => metadataOf(image)?.summary ?? null;

// The details of a property of an image for its mark on the page (the tip under the mouse pointer); null = the name of the
// property says it all.
/** @type {Readonly<Record<Enums.ImageInfoSandbox.NoticeTag, Functions.ImageInfoSandbox.Element.noticeDetail>>} */
const NOTICE_DETAILS = {
	place: (image) => {
		const summary = summaryOf(image);
		const gps = summary && summary.gps ? `${t("imageInfoSandbox_summary_gps")}: ${summary.gps.latitude}, ${summary.gps.longitude}` : null;
		return [summary?.place, gps].filter(Boolean).join(" · ") || null;
	},
	camera: (image) => [summaryOf(image)?.camera, summaryOf(image)?.lens].filter(Boolean).join(" · ") || null,
	taken: (image) => summaryOf(image)?.taken ?? null,
	serial: (image) => serialNumber(image, "camera"),
	lensSerial: (image) => serialNumber(image, "lens"),
	exifThumbnail: () => t("imageInfoSandbox_chip_exif_thumbnail_title"),
	copyright: (image) => {
		const summary = summaryOf(image);
		const author = summary?.author ? `${t("imageInfoSandbox_summary_author")}: ${summary.author}` : null;
		const copyright = summary?.copyright ? `${t("imageInfoSandbox_summary_copyright")}: ${summary.copyright}` : null;
		return [author, copyright].filter(Boolean).join(" · ") || null;
	},
	software: (image) => summaryOf(image)?.software ?? null,
	noLabel: () => t("imageInfoSandbox_chip_no_label_title"),
	noDimensions: () => t("imageInfoSandbox_chip_no_dimensions_title"),
	mismatch: (image) => {
		const mismatch = typeMismatch(image);
		return mismatch ? t("imageInfoSandbox_metadata_mismatch", mismatch.declared, mismatch.actual) : null;
	},
	failed: (image) => {
		const { network, timing } = image;
		const status = network ? network.error || network.statusLine || (network.statusCode !== null ? String(network.statusCode) : null) : timing && timing.responseStatus ? String(timing.responseStatus) : null;
		return status ? `${t("imageInfoSandbox_row_status")}: ${status}` : null;
	},
	mixedContent: () => t("imageInfoSandbox_chip_mixed_content_title"),
	trackingPixel: () => t("imageInfoSandbox_chip_tracking_pixel_title", TRACKING_PIXEL_SIZE),
	crossOrigin: (image) => {
		try {
			return new URL(image.url).origin;
		} catch {
			return null;
		}
	},
	animated: (image) => {
		const metadata = metadataOf(image);
		return metadata && metadata.frames ? `${t("imageInfoSandbox_summary_frames")}: ${formatCount(metadata.frames)}` : null;
	},
	oversized: (image, context) => {
		const oversized = oversizedBy(image, context.oversizeFactor);
		return oversized ? t("imageInfoSandbox_chip_oversized_title", size(...oversized.file), size(...oversized.rendered)) : null;
	},
	largeFile: (image, context) => t("imageInfoSandbox_chip_large_file_title", formatBytes(imageBytes(image) ?? 0), formatBytes(context.largeFileBytes)),
	complete: () => t("imageInfoSandbox_chip_complete_title"),
	removed: () => null,
	notLoaded: () => null,
	unused: () => null,
	fromCache: () => null,
	lazy: () => null,
	exif: () => null,
	xmp: () => null,
	iptc: () => null,
	gps: (image) => {
		const gps = summaryOf(image)?.gps;
		return gps ? `${gps.latitude}, ${gps.longitude}` : null;
	},
};

// The properties whose details only explain the property (the same text for every image) — a permanent record lists them
// by their name alone.
/** @type {ReadonlySet<Enums.ImageInfoSandbox.NoticeTag>} */
const EXPLAINED_ONLY = new Set(["exifThumbnail", "noLabel", "noDimensions", "mixedContent", "trackingPixel", "complete"]);

// The mark of a property of an image on the page: its icon (NOTICE_DEFAULT_ICON for a property without its own), its name
// without the icon the names of some properties start with, and its details — shortened to the limits of the core.
/** @type {Functions.ImageInfoSandbox.Element.noticeMark} */
function noticeMark(image, tag, context) {
	const icon = noticeIcon(tag);
	const name = noticeTagText(tag);
	const detail = NOTICE_DETAILS[tag](image, context);
	return {
		icon,
		label: clipText(name.startsWith(icon) ? name.slice(icon.length).trim() : name, MARK_LIMITS.label),
		detail: detail ? clipText(detail, MARK_LIMITS.detail) : null,
	};
}

/** @implements {Classes.ExtensionImageInfoSandbox} */
class ExtensionImageInfoSandbox extends /** @type {Types.WithFields<typeof BaseElement, Classes.ExtensionImageInfoSandbox.Fields>} */ (BaseElement) {
	/**
	 * @override
	 * @type {typeof Classes.ExtensionImageInfoSandbox.observedAttributes}
	 */
	static get observedAttributes() {
		return [];
	}

	constructor() {
		super();
		/** @type {Classes.ExtensionImageInfoSandbox['_result']} */
		this._result = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_shownJson']} */
		this._shownJson = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_error']} */
		this._error = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_states']} */
		this._states = {};
		/** @type {Classes.ExtensionImageInfoSandbox['_open']} */
		this._open = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_openGroups']} */
		this._openGroups = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_expandedSingle']} */
		this._expandedSingle = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_autoOpened']} */
		this._autoOpened = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_scrolledFor']} */
		this._scrolledFor = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_fetching']} */
		this._fetching = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_fetchAnonymous']} */
		this._fetchAnonymous = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_saving']} */
		this._saving = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_removing']} */
		this._removing = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_blocking']} */
		this._blocking = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_thumbs']} */
		this._thumbs = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_thumbLoading']} */
		this._thumbLoading = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_thumbMissing']} */
		this._thumbMissing = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_thumbErrors']} */
		this._thumbErrors = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_tabsOnly']} */
		this._tabsOnly = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_clickOnly']} */
		this._clickOnly = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_stopClicks']} */
		this._stopClicks = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_loadingKey']} */
		this._loadingKey = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_loadingRetries']} */
		this._loadingRetries = 0;
		/** @type {Classes.ExtensionImageInfoSandbox['_filter']} */
		this._filter = "";
		/** @type {Classes.ExtensionImageInfoSandbox['_sort']} */
		this._sort = DEFAULT_SORT;
		/** @type {Classes.ExtensionImageInfoSandbox['_small']} */
		this._small = { ignore: DEFAULT_IGNORE_SMALL, width: DEFAULT_SMALL_SIZE, height: DEFAULT_SMALL_SIZE };
		/** @type {Classes.ExtensionImageInfoSandbox['_hideUnused']} */
		this._hideUnused = DEFAULT_HIDE_UNUSED;
		/** @type {Classes.ExtensionImageInfoSandbox['_cleanDynamic']} */
		this._cleanDynamic = DEFAULT_CLEAN_DYNAMIC;
		/** @type {Classes.ExtensionImageInfoSandbox['_onlyImportant']} */
		this._onlyImportant = DEFAULT_ONLY_IMPORTANT;
		/** @type {Classes.ExtensionImageInfoSandbox['_notices']} */
		this._notices = DEFAULT_NOTICES;
		/** @type {Classes.ExtensionImageInfoSandbox['_limits']} */
		this._limits = { oversizeFactor: DEFAULT_OVERSIZE_FACTOR, largeFileBytes: DEFAULT_LARGE_FILE_KB * 1000 };
		/** @type {Classes.ExtensionImageInfoSandbox['_announced']} */
		this._announced = { document: null, keys: new Set() };
		/** @type {Classes.ExtensionImageInfoSandbox['_announcing']} */
		this._announcing = Promise.resolve();
		/** @type {Classes.ExtensionImageInfoSandbox['_notifyProblem']} */
		this._notifyProblem = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_markImages']} */
		this._markImages = [];
		/** @type {Classes.ExtensionImageInfoSandbox['_markJson']} */
		this._markJson = "[]";
		/** @type {Classes.ExtensionImageInfoSandbox['_marking']} */
		this._marking = Promise.resolve();
		/** @type {Classes.ExtensionImageInfoSandbox['_markTimer']} */
		this._markTimer = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_markProblem']} */
		this._markProblem = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_noticeOpen']} */
		this._noticeOpen = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_noticeShown']} */
		this._noticeShown = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_cleaning']} */
		this._cleaning = { tabId: null, documentAt: null, address: null, last: new Map(), before: new Map() };
		/** @type {Classes.ExtensionImageInfoSandbox['_token']} */
		this._token = 0;
		/** @type {Classes.ExtensionImageInfoSandbox['_loading']} */
		this._loading = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_again']} */
		this._again = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_timer']} */
		this._timer = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_hiddenChange']} */
		this._hiddenChange = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_stopTabs']} */
		this._stopTabs = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_stopChanges']} */
		this._stopChanges = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_stopView']} */
		this._stopView = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_view']} */
		this._view = { visible: new Set(), hovered: new Set() };
		/** @type {Classes.ExtensionImageInfoSandbox['_items']} */
		this._items = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_records']} */
		this._records = [];
		/** @type {Classes.ExtensionImageInfoSandbox['_recordCount']} */
		this._recordCount = 0;
		/** @type {Classes.ExtensionImageInfoSandbox['_recorded']} */
		this._recorded = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_recordsReady']} */
		this._recordsReady = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_recordsLoad']} */
		this._recordsLoad = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_recordsAgain']} */
		this._recordsAgain = false;
		/** @type {Classes.ExtensionImageInfoSandbox['_recording']} */
		this._recording = Promise.resolve();
		/** @type {Classes.ExtensionImageInfoSandbox['_recordingKeys']} */
		this._recordingKeys = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_recordTried']} */
		this._recordTried = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_dismissed']} */
		this._dismissed = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_recordProblem']} */
		this._recordProblem = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_openRecords']} */
		this._openRecords = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_removingRecords']} */
		this._removingRecords = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_recordsShown']} */
		this._recordsShown = null;
		/** @type {Classes.ExtensionImageInfoSandbox['_listRecorded']} */
		this._listRecorded = "";
		/** @type {Classes.ExtensionImageInfoSandbox['_recordNotes']} */
		this._recordNotes = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_openSerials']} */
		this._openSerials = new Set();
		/** @type {Classes.ExtensionImageInfoSandbox['_serialRecords']} */
		this._serialRecords = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_matches']} */
		this._matches = new Map();
		/** @type {Classes.ExtensionImageInfoSandbox['_matchJson']} */
		this._matchJson = "[]";
		/** @type {Classes.ExtensionImageInfoSandbox['_matching']} */
		this._matching = Promise.resolve();
		/** @type {Classes.ExtensionImageInfoSandbox['_matchNotify']} */
		this._matchNotify = { camera: DEFAULT_SERIAL_MATCH_NOTIFY, lens: DEFAULT_SERIAL_MATCH_NOTIFY };
		/** @type {Classes.ExtensionImageInfoSandbox['_matchAnnounced']} */
		this._matchAnnounced = { document: null, keys: new Set() };
		/** @type {Classes.ExtensionImageInfoSandbox['_matchProblem']} */
		this._matchProblem = null;
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['connectedCallback']}
	 */
	connectedCallback() {
		this.className = "module-output";
		this.textContent = t("imageInfoSandbox_loading");
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['disconnectedCallback']}
	 */
	disconnectedCallback() {
		// The core unsubscribes the module's listeners itself when its element in the extension page goes away (the
		// whole sandbox page goes with it) — this is for a detach in the sandbox.
		super.disconnectedCallback();
		this._follow(false, false);
		this._followView(false);
		if (this._timer) clearTimeout(this._timer);
		this._timer = null;
		// The marks on the page are not sent again — the frames take them away after the lease.
		if (this._markTimer) clearInterval(this._markTimer);
		this._markTimer = null;
		for (const url of this._thumbs.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
		this._thumbs.clear();
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['connectedMoveCallback']}
	 */
	connectedMoveCallback() {
		// No state tied to a position in the DOM.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['adoptedCallback']}
	 */
	adoptedCallback() {
		// The module does not need to react to a move into another document.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['attributeChangedCallback']}
	 */
	attributeChangedCallback(_name, _oldValue, _newValue) {
		// The module observes no HTML attributes.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfoSandbox['init']}
	 */
	async init({ outputEl, name, mode, location }) {
		await super.init({ outputEl, name, mode, location });
		const api = sandboxApi(this);

		this.textContent = "";
		const root = create("div", "iis");
		this._statusEl = create("div", "iis-status");
		this._toolbarEl = create("div", "iis-toolbar");
		this._summaryEl = create("span", "iis-toolbar__summary");
		this._searchEl = document.createElement("input");
		this._searchEl.type = "search";
		this._searchEl.className = "iis-toolbar__search";
		this._searchEl.placeholder = t("imageInfoSandbox_search");
		this._searchEl.setAttribute("aria-label", t("imageInfoSandbox_search"));
		this._searchEl.addEventListener("input", () => {
			this._filter = this._searchEl.value;
			this._renderList();
		});
		this._sortEl = document.createElement("select");
		this._sortEl.className = "iis-toolbar__sort";
		this._sortEl.setAttribute("aria-label", t("imageInfoSandbox_sort"));
		for (const order of SORT_ORDERS) {
			const option = document.createElement("option");
			option.value = order;
			option.textContent = SORT_LABELS[order]();
			this._sortEl.appendChild(option);
		}
		this._sortEl.addEventListener("change", () => {
			this._sort = /** @type {Enums.ImageInfoSandbox.SortOrder} */ (this._sortEl.value);
			this._renderList();
			this.api.state.set(SORT_STATE_KEY, this._sort).catch((err) => console.warn("imageInfoSandbox: řazení nejde uložit", err));
		});
		this._refreshEl = create("button", "iis-toolbar__refresh", t("imageInfoSandbox_refresh"));
		/** @type {HTMLButtonElement} */ (this._refreshEl).type = "button";
		this._refreshEl.addEventListener("click", () => void this._refresh());
		// Ignoring small images — the setting of the module (the same checkbox is in Settings, with the size).
		const small = create("label", "iis-toolbar__small");
		small.title = t("imageInfoSandbox_ignore_small_title");
		this._smallEl = document.createElement("input");
		this._smallEl.type = "checkbox";
		this._smallEl.checked = this._small.ignore;
		this._smallEl.addEventListener("change", () => {
			this._small = { ...this._small, ignore: this._smallEl.checked };
			this._renderList();
			this.api.settings.set(IGNORE_SMALL_KEY, this._small.ignore).catch((err) => console.warn("imageInfoSandbox: nastavení nejde uložit", err));
		});
		this._smallTextEl = create("span");
		small.append(this._smallEl, this._smallTextEl);
		// Hiding the images "not on the page" — the setting of the module (the same checkbox is in Settings).
		const unused = create("label", "iis-toolbar__small");
		unused.title = t("imageInfoSandbox_hide_unused_title");
		this._unusedEl = document.createElement("input");
		this._unusedEl.type = "checkbox";
		this._unusedEl.checked = this._hideUnused;
		this._unusedEl.addEventListener("change", () => {
			this._hideUnused = this._unusedEl.checked;
			this._renderList();
			this.api.settings.set(HIDE_UNUSED_KEY, this._hideUnused).catch((err) => console.warn("imageInfoSandbox: nastavení nejde uložit", err));
		});
		unused.append(this._unusedEl, create("span", "", t("imageInfoSandbox_hide_unused")));
		// Cleaning at a new address of the same document — the setting of the module (the same checkbox is in Settings).
		const clean = create("label", "iis-toolbar__small");
		clean.title = t("imageInfoSandbox_clean_dynamic_title");
		this._cleanEl = document.createElement("input");
		this._cleanEl.type = "checkbox";
		this._cleanEl.checked = this._cleanDynamic;
		this._cleanEl.addEventListener("change", () => {
			this._cleanDynamic = this._cleanEl.checked;
			this._renderList();
			this.api.settings.set(CLEAN_DYNAMIC_KEY, this._cleanDynamic).catch((err) => console.warn("imageInfoSandbox: nastavení nejde uložit", err));
		});
		clean.append(this._cleanEl, create("span", "", t("imageInfoSandbox_clean_dynamic")));
		// Only the images with an important property — the setting of the module (the same checkbox is in Settings).
		const important = create("label", "iis-toolbar__small");
		important.title = t("imageInfoSandbox_only_important_title");
		this._importantEl = document.createElement("input");
		this._importantEl.type = "checkbox";
		this._importantEl.checked = this._onlyImportant;
		this._importantEl.addEventListener("change", () => {
			this._onlyImportant = this._importantEl.checked;
			this._renderList();
			this.api.settings.set(ONLY_IMPORTANT_KEY, this._onlyImportant).catch((err) => console.warn("imageInfoSandbox: nastavení nejde uložit", err));
		});
		important.append(this._importantEl, create("span", "", t("imageInfoSandbox_only_important")));
		this._toolbarEl.append(this._summaryEl, this._searchEl, this._sortEl, this._refreshEl, small, unused, clean, important);
		this._listEl = create("ol", "iis-list");
		// The permanent records — above the toolbar, collapsed; the records are built only while it is expanded.
		this._recordsEl = create("details", "iis-records");
		this._recordsEl.hidden = true;
		this._recordsTitleEl = create("summary", "iis-records__title");
		this._recordsListEl = create("ol", "iis-list iis-records__list");
		this._recordsEl.append(this._recordsTitleEl, this._recordsListEl);
		this._recordsEl.addEventListener("toggle", () => this._renderRecords());
		root.append(this._statusEl, this._recordsEl, this._toolbarEl, this._listEl);
		this.append(root);

		try {
			const stored = await this.api.state.get(SORT_STATE_KEY, DEFAULT_SORT);
			if (SORT_ORDERS.includes(/** @type {Enums.ImageInfoSandbox.SortOrder} */ (stored))) this._sort = /** @type {Enums.ImageInfoSandbox.SortOrder} */ (stored);
		} catch (err) {
			console.warn(err);
		}
		this._sortEl.value = this._sort;
		await this._loadSettings();
		// The permanent records before the first listing — automatic recording must know the recorded and the removed ones.
		// Another surface that records or removes one says so through RECORDS_STATE_KEY.
		this.api.state.onChange(RECORDS_STATE_KEY, () => void this._loadRecords());
		await this._loadRecords();

		// The user decides about the functions in Settings — after a change the listing starts again (in the click mode it is only
		// drawn again: the page is listed at a click). The mode changes in Settings without recreating the element — the element
		// watches it itself.
		api.capabilities.onChange((states) => {
			this._states = states;
			this._applyMode();
			this._shownJson = null;
			if (this._clickOnly) this._render();
			else void this._refresh();
		});
		this.api.settings.onChange(() => void this._onSettingsChanged());
		// A click on a notification of the listing — only where the listing stays open next to the page.
		if (this._location === "sidebar" || this._location === "floating") this.api.notifications.onClick((click) => this._onNoticeClick(click));
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState !== "visible") return;
			if (this._markImages.length > 0) this._sendMarks();
			if (this._hiddenChange) {
				this._hiddenChange = false;
				this._scheduleRefresh();
			}
		});
		try {
			this._states = await api.capabilities.state();
		} catch (err) {
			console.error(err);
		}
		this._applyMode();
		// In the click mode the page waits for a click on the extension button (or Refresh) — _applyMode() subscribed to them.
		if (this._clickOnly) this._render();
		else await this._refresh();
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_allowed']} */
	_allowed(capability) {
		return this._states[capability] === "allowed";
	}

	// The settings of the listing: the checkboxes of the toolbar (small images with their size, the images not on the page,
	// cleaning dynamically) into the toolbar, and the notices about the properties of images. Returns whether they changed.
	/** @type {Classes.ExtensionImageInfoSandbox['_loadSettings']} */
	async _loadSettings() {
		/** @type {Types.ImageInfoSandbox.SmallImages} */
		let small;
		let changedOther = false;
		try {
			const [ignore, width, height, hideUnused, cleanDynamic, notices, oversize, largeFile, onlyImportant, matchCamera, matchLens] = await Promise.all([
				this.api.settings.get(IGNORE_SMALL_KEY, DEFAULT_IGNORE_SMALL),
				this.api.settings.get(SMALL_WIDTH_KEY, String(DEFAULT_SMALL_SIZE)),
				this.api.settings.get(SMALL_HEIGHT_KEY, String(DEFAULT_SMALL_SIZE)),
				this.api.settings.get(HIDE_UNUSED_KEY, DEFAULT_HIDE_UNUSED),
				this.api.settings.get(CLEAN_DYNAMIC_KEY, DEFAULT_CLEAN_DYNAMIC),
				this.api.settings.get(NOTICES_KEY, /** @type {unknown} */ (null)),
				this.api.settings.get(OVERSIZE_KEY, String(DEFAULT_OVERSIZE_FACTOR)),
				this.api.settings.get(LARGE_FILE_KEY, String(DEFAULT_LARGE_FILE_KB)),
				this.api.settings.get(ONLY_IMPORTANT_KEY, DEFAULT_ONLY_IMPORTANT),
				this.api.settings.get(MATCH_NOTIFY_KEYS.camera, DEFAULT_SERIAL_MATCH_NOTIFY),
				this.api.settings.get(MATCH_NOTIFY_KEYS.lens, DEFAULT_SERIAL_MATCH_NOTIFY),
			]);
			small = { ignore: ignore !== false, width: resolveSmallSize(width), height: resolveSmallSize(height) };
			const matchNotify = { camera: matchCamera === true, lens: matchLens === true };
			if (matchNotify.camera !== this._matchNotify.camera || matchNotify.lens !== this._matchNotify.lens) {
				this._matchNotify = matchNotify;
				changedOther = true;
			}
			if ((hideUnused !== false) !== this._hideUnused) {
				this._hideUnused = hideUnused !== false;
				changedOther = true;
			}
			if ((cleanDynamic !== false) !== this._cleanDynamic) {
				this._cleanDynamic = cleanDynamic !== false;
				changedOther = true;
			}
			if ((onlyImportant !== false) !== this._onlyImportant) {
				this._onlyImportant = onlyImportant !== false;
				changedOther = true;
			}
			const resolved = resolveNotices(notices);
			if (JSON.stringify(resolved) !== JSON.stringify(this._notices)) {
				this._notices = resolved;
				changedOther = true;
			}
			const limits = { oversizeFactor: resolveOversizeFactor(oversize), largeFileBytes: resolveLargeFileKB(largeFile) * 1000 };
			if (limits.oversizeFactor !== this._limits.oversizeFactor || limits.largeFileBytes !== this._limits.largeFileBytes) {
				this._limits = limits;
				changedOther = true;
			}
		} catch (err) {
			console.warn(err);
			return false;
		}
		const changed = changedOther || small.ignore !== this._small.ignore || small.width !== this._small.width || small.height !== this._small.height;
		this._unusedEl.checked = this._hideUnused;
		this._cleanEl.checked = this._cleanDynamic;
		this._importantEl.checked = this._onlyImportant;
		this._small = small;
		this._smallEl.checked = small.ignore;
		this._smallTextEl.textContent = t("imageInfoSandbox_ignore_small", formatCount(small.width), formatCount(small.height));
		return changed;
	}

	// The settings changed in Settings: the settings of the listing (the list again right away; a notification turned on
	// announces the images of the listed page right away) and the mode — the listing starts or stops following the page.
	/** @type {Classes.ExtensionImageInfoSandbox['_onSettingsChanged']} */
	async _onSettingsChanged() {
		if (await this._loadSettings()) {
			this._render();
			this._announce(this._result ? this._result.page : null);
			this._autoRecord(this._result ? this._result.page : null);
			this._findMatches(this._result ? this._result.page : null);
			this._mark(this._result ? this._result.page : null);
		}
		/** @type {Enums.ActivationMode} */
		let mode;
		try {
			mode = await this.api.settings.getMode(DEFAULT_ACTIVATION_MODE);
		} catch (err) {
			console.error(err);
			return;
		}
		if (mode === this._mode) return;
		this._setMode(mode);
		this._applyMode();
		// Drawn again even when the listing stays the same — the note of the click mode comes or goes. Into the click mode
		// the listing keeps what it shows until a click.
		this._shownJson = null;
		if (this._clickOnly) this._render();
		else await this._refresh();
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_setMode']} */
	_setMode(mode) {
		this._mode = mode;
	}

	// Follows the page by the current mode: LIVE_SPEC another tab, a new address and new images of the page; ICON_CLICK_SPEC
	// outside the popup only the clicks on the extension button; the other modes in the side panel and on the dashboard another
	// tab and a new address (they outlive a switch of tabs); the disabled one only says so.
	/** @type {Classes.ExtensionImageInfoSandbox['_applyMode']} */
	_applyMode() {
		const satisfied = this.isActivationSatisfied();
		const live = satisfied && LIVE_SPEC.isSatisfiedBy({ mode: this._mode });
		this._clickOnly = satisfied && this._location !== "popup" && ICON_CLICK_SPEC.isSatisfiedBy({ mode: this._mode });
		this._tabsOnly = satisfied && !live && !this._clickOnly && followsActiveTab(this._location);
		this._follow(live, live || this._tabsOnly);
		this._followClicks(this._clickOnly);
		this._followView(satisfied);
		this.classList.toggle("iis-host--live", live);
	}

	// Lists the page after every click on the extension button (also the click that opened this surface a moment ago — the core
	// delivers it right after subscribing). The listing a click started in imageInfo (its icon_click mode) is waited for there.
	/** @type {Classes.ExtensionImageInfoSandbox['_followClicks']} */
	_followClicks(on) {
		if (on) {
			this._stopClicks ??= this.api.activation.onIconClick(() => void this._refresh());
		} else if (this._stopClicks) {
			this._stopClicks();
			this._stopClicks = null;
		}
	}

	// Starts (or stops) following new images of the page (imageInfo.onChange) and another tab or a new address (tabs.onChange).
	/** @type {Classes.ExtensionImageInfoSandbox['_follow']} */
	_follow(images, tabs) {
		if (tabs) {
			this._stopTabs ??= this.api.tabs.onChange(() => this._scheduleRefresh());
		} else if (this._stopTabs) {
			this._stopTabs();
			this._stopTabs = null;
		}
		if (images) {
			if (!this._stopChanges && this._allowed(ON_CHANGE)) {
				this._stopChanges = sandboxApi(this).capabilities.listen(ON_CHANGE, () => this._scheduleRefresh());
			}
		} else if (this._stopChanges) {
			this._stopChanges();
			this._stopChanges = null;
		}
	}

	// Follows which images are visible on the page and which one is under the pointer (imageInfo.onView) while the listing is
	// shown and the user allows it — in every mode; without it the lines have no highlights.
	/** @type {Classes.ExtensionImageInfoSandbox['_followView']} */
	_followView(on) {
		const wanted = on && this._allowed(ON_VIEW);
		if (wanted && !this._stopView) {
			this._stopView = sandboxApi(this).capabilities.listen(ON_VIEW, (view) => this._showView(view));
		} else if (!wanted && this._stopView) {
			this._stopView();
			this._stopView = null;
			this._showView(null);
		}
	}

	// The images visible on the page and the one under the pointer ({ visible, hovered } — their keys) as the highlights of
	// their lines; anything else — none. The image under the pointer is in the list even when it would be hidden (a small
	// one, …) — when that changes, the list is built again.
	/** @type {Classes.ExtensionImageInfoSandbox['_showView']} */
	_showView(view) {
		const value = /** @type {{ visible?: unknown; hovered?: unknown } | null} */ (view && typeof view === "object" ? view : null);
		const keys = (/** @type {unknown} */ list) => new Set(Array.isArray(list) ? list.filter((key) => typeof key === "string") : []);
		const page = this._result ? this._result.page : null;
		const revealed = page ? JSON.stringify(this._shownImages(page).revealed) : "";
		this._view = { visible: keys(value?.visible), hovered: keys(value?.hovered) };
		if (page && JSON.stringify(this._shownImages(page).revealed) !== revealed) {
			this._renderList();
			return;
		}
		for (const [key, item] of this._items) this._highlight(item, key);
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_highlight']} */
	_highlight(item, key) {
		item.classList.toggle("iis-item--visible", this._view.visible.has(key));
		item.classList.toggle("iis-item--hovered", this._view.hovered.has(key));
	}

	// The side panel outside LIVE_SPEC learns of a new address while the new page is loading (and nothing about its images
	// then): a listing of a page that has not loaded yet, or could not be examined in the middle of the navigation, is
	// repeated in a moment — at most LOADING_RETRIES times for the page.
	/** @type {Classes.ExtensionImageInfoSandbox['_repeatWhileLoading']} */
	_repeatWhileLoading(page) {
		if (!this._tabsOnly || !page || !page.tab) return;
		const key = `${page.tab.tabId} ${page.tab.url}`;
		if (key !== this._loadingKey) {
			this._loadingKey = key;
			this._loadingRetries = 0;
		}
		const top = page.frames.find((frame) => frame.frameId === 0);
		const loading = page.error === "inject" || (top !== undefined && top.readyState !== null && top.readyState !== "complete");
		if (!loading || this._loadingRetries >= LOADING_RETRIES) return;
		this._loadingRetries++;
		this._scheduleRefresh();
	}

	// A change: in a moment (a page loading its images reports many in quick succession); in the focus mode, and in the side
	// panel outside LIVE_SPEC, not while the surface is hidden — then once it is visible again.
	/** @type {Classes.ExtensionImageInfoSandbox['_scheduleRefresh']} */
	_scheduleRefresh() {
		if ((VISIBLE_ONLY_SPEC.isSatisfiedBy({ mode: this._mode }) || this._tabsOnly) && document.visibilityState === "hidden") {
			this._hiddenChange = true;
			return;
		}
		if (this._timer) return;
		this._timer = setTimeout(() => {
			this._timer = null;
			void this._refresh();
		}, REFRESH_DELAY_MS);
	}

	// Asks for the listing of the page (imageInfo.getPage). A change during a listing asks once more right after it.
	/** @type {Classes.ExtensionImageInfoSandbox['_refresh']} */
	async _refresh() {
		if (!this.isActivationSatisfied()) {
			this._result = null;
			this._error = null;
			this._statusEl.textContent = t("imageInfoSandbox_disabled", this._name);
			this._toolbarEl.hidden = true;
			this._listEl.textContent = "";
			this._items.clear();
			this._renderRecords();
			this._mark(null);
			return;
		}
		if (!this._allowed(GET_PAGE)) {
			this._result = null;
			this._error = t("imageInfoSandbox_not_allowed", this._name || TAG);
			this._render();
			this._mark(null);
			return;
		}
		if (this._loading) {
			this._again = true;
			return;
		}
		this._loading = true;
		this._refreshEl.setAttribute("aria-busy", "true");
		const token = ++this._token;
		try {
			const result = /** @type {Types.SandboxImageInfoPage} */ (await sandboxApi(this).capabilities.call(GET_PAGE));
			if (token !== this._token || !this.isConnected) return;
			this._error = null;
			this._cleaning = nextCleaning(this._cleaning, result.page);
			// The same listing again (a refresh without a change) is not drawn again.
			const json = JSON.stringify({ ...result, page: result.page ? { ...result.page, collectedAt: 0 } : null });
			this._result = result;
			if (json !== this._shownJson) {
				this._shownJson = json;
				this._render();
			} else {
				this._renderSummary();
			}
			this._repeatWhileLoading(result.page);
			this._applyNoticeOpen();
			this._announce(result.page);
			this._autoRecord(result.page);
			this._findMatches(result.page);
			this._mark(result.page);
		} catch (err) {
			if (token !== this._token || !this.isConnected) return;
			console.error(err);
			this._error = t("imageInfoSandbox_load_failed", this._name || TAG, errorText(err));
			this._shownJson = null;
			this._render();
			this._mark(null);
		} finally {
			this._loading = false;
			this._refreshEl.removeAttribute("aria-busy");
			if (this._again) {
				this._again = false;
				this._scheduleRefresh();
			}
		}
	}

	// A line of the status with an optional button that opens Settings.
	/** @type {Classes.ExtensionImageInfoSandbox['_statusLine']} */
	_statusLine(text, kind = "", options = false) {
		const line = create("p", `iis-status__line${kind ? ` iis-status__line--${kind}` : ""}`, text);
		if (options && this._allowed(OPEN_OPTIONS)) {
			const button = create("button", "iis-status__button", t("imageInfoSandbox_open_options"));
			/** @type {HTMLButtonElement} */ (button).type = "button";
			button.addEventListener("click", () => {
				sandboxApi(this)
					.capabilities.call(OPEN_OPTIONS)
					.catch((err) => console.warn("imageInfoSandbox: Nastavení nejde otevřít", err));
			});
			line.append(" ", button);
		}
		this._statusEl.appendChild(line);
	}

	// The status, the summary and the list of the last listing (or why there is none).
	/** @type {Classes.ExtensionImageInfoSandbox['_render']} */
	_render() {
		this._statusEl.textContent = "";
		const result = this._result;
		const page = result ? result.page : null;
		this._toolbarEl.hidden = !page || page.images.length === 0;
		if (this._error) {
			this._statusLine(this._error, "error");
			this._listEl.textContent = "";
			this._items.clear();
			this._renderSummary();
			return;
		}
		// The click mode says why the listing does not follow the page — also before the first click (then with the permanent records only).
		if (this._clickOnly) this._statusLine(t("imageInfoSandbox_click_only"), "note");
		if (!result) {
			if (this._clickOnly) this._renderRecords();
			return;
		}
		if (result.reason === "notListed") this._statusLine(t("imageInfoSandbox_not_listed"), "warning", true);
		else if (result.reason === "disabled") this._statusLine(t("imageInfoSandbox_module_disabled"), "warning", true);
		else if (!page) this._statusLine(t("imageInfoSandbox_no_tab"));
		if (page) this._renderPageStatus(page);
		if (this._notifyProblem) this._statusLine(this._notifyProblem, "warning", true);
		if (this._matchProblem) this._statusLine(this._matchProblem, "warning", true);
		if (this._recordProblem) this._statusLine(this._recordProblem, "warning");
		this._renderRecords();
		if (NOTICE_TAGS.some((tag) => this._notices[tag].page || this._notices[tag].pageLarge) && !this._allowed(MARK_IMAGES)) this._statusLine(t("imageInfoSandbox_mark_not_allowed"), "warning", true);
		else if (this._markProblem) this._statusLine(this._markProblem, "warning");
		this._renderSummary();
		this._renderList();
		if (page) this._scrollToImagePage(page);
	}

	// The notifications about the images with a property whose "Send a notification" is on: the keys of the images and their
	// properties the document has not announced yet (newNotices()) — first by what this listing announced or saw announced for
	// the document (most listings end here without asking the core), then by the ones remembered for all surfaces in
	// api.state (NOTICE_STATE_KEY). The new ones go there, and one silent notification says how many images of the document have the
	// properties now (all announced, not only the new ones — the notification of the document replaces its previous one, the
	// same tag). A notification that cannot be shown (Chrome without the permission) is a line of the status with the button
	// to Settings, until one is shown; the images stay announced. Listings one after another.
	/** @type {Classes.ExtensionImageInfoSandbox['_announce']} */
	_announce(page) {
		this._announcing = this._announcing.then(() => this._announceNow(page)).catch((err) => console.warn("imageInfoSandbox: oznámení nejde poslat", err));
	}

	// A click on a notification of the listing: the floating window only for its own tab (the page around it); the tab comes
	// to the front (the side panel then lists it), the images open once the listing has that document (_applyNoticeOpen()).
	/** @type {Classes.ExtensionImageInfoSandbox['_onNoticeClick']} */
	_onNoticeClick(click) {
		const notice = readNoticeClick(click);
		if (!notice || !this.isActivationSatisfied()) return;
		const page = this._result ? this._result.page : null;
		if (this._location === "floating" && (!page || !page.tab || page.tab.tabId !== notice.tabId)) return;
		this._noticeOpen = { ...notice, until: Date.now() + NOTICE_OPEN_MS };
		if (this._allowed(ACTIVATE_TAB)) {
			sandboxApi(this)
				.capabilities.call(ACTIVATE_TAB, { tabId: notice.tabId })
				.catch((err) => console.warn("imageInfoSandbox: na záložku oznámení nejde přepnout", err));
		}
		if (!this._applyNoticeOpen()) this._scheduleRefresh();
	}

	// The images of the clicked notification, once the listing lists its document: expanded, shown even when they would be
	// hidden (until another document), the page scrolled to the first of them in the list. Returns whether it happened; a
	// click older than NOTICE_OPEN_MS is forgotten.
	/** @type {Classes.ExtensionImageInfoSandbox['_applyNoticeOpen']} */
	_applyNoticeOpen() {
		const pending = this._noticeOpen;
		if (!pending) return false;
		if (Date.now() > pending.until) {
			this._noticeOpen = null;
			return false;
		}
		const page = this._result ? this._result.page : null;
		if (!page || noticeDocument(page) !== pending.document) return false;
		this._noticeOpen = null;
		const wanted = new Set(pending.images);
		const keys = page.images.filter((image) => wanted.has(image.key)).map((image) => image.key);
		if (keys.length === 0) return true;
		this._noticeShown = { document: pending.document, keys: new Set(keys) };
		for (const key of keys) this._open.add(key);
		this._renderList();
		const lines = new Set(keys.map((key) => this._items.get(key)));
		const first = [...this._listEl.children].find((item) => lines.has(/** @type {HTMLLIElement} */ (item)));
		if (first) {
			const offset = Math.max(0, first.getBoundingClientRect().top + window.scrollY);
			sandboxApi(this)
				.ui.scrollIntoView({ offset })
				.catch((err) => console.warn("imageInfoSandbox: na obrázek oznámení nejde posunout", err));
		}
		return true;
	}

	// The marks of the images on the page itself (the columns "Show on the page" and "… over larger images" of the notices): the
	// images the page uses with such a property, each with its file name and the marks of its properties (noticeMark()); none
	// while the listing is not active, has no page or the function is not allowed. Sent when they change — an empty list once, to take the previous ones
	// away — and again every MARK_RENEW_MS while the surface is visible (_renewMarks()): the frames keep them only for a while,
	// a closed listing leaves nothing in the page.
	/** @type {Classes.ExtensionImageInfoSandbox['_mark']} */
	_mark(page) {
		const wanted = page !== null && this.isActivationSatisfied() && this._allowed(MARK_IMAGES) && NOTICE_TAGS.some((tag) => this._notices[tag].page || this._notices[tag].pageLarge);
		/** @type {Types.ImageInfo.MarkedImage[]} */
		let images = [];
		if (wanted && page) {
			const context = noticeContext(page, this._limits);
			images = markedImages(page, this._notices, this._limits, this._small, MARK_LIMITS.images).map(({ image, tags }) => ({
				url: image.url,
				name: clipText(fileName(image.url), MARK_LIMITS.name),
				marks: tags.slice(0, MARK_LIMITS.marks).map((tag) => noticeMark(image, tag, context)),
			}));
		}
		const json = JSON.stringify(images);
		if (json === this._markJson) return;
		this._markJson = json;
		this._markImages = images;
		this._renewMarks();
		this._sendMarks();
	}

	// The marks again every MARK_RENEW_MS while there are some and the surface is visible; without them it stops.
	/** @type {Classes.ExtensionImageInfoSandbox['_renewMarks']} */
	_renewMarks() {
		if (this._markImages.length > 0) {
			this._markTimer ??= setInterval(() => {
				if (document.visibilityState === "visible") this._sendMarks();
			}, MARK_RENEW_MS);
		} else if (this._markTimer) {
			clearInterval(this._markTimer);
			this._markTimer = null;
		}
	}

	// Sends the current marks (imageInfo.markImages) — the requests one after another.
	/** @type {Classes.ExtensionImageInfoSandbox['_sendMarks']} */
	_sendMarks() {
		this._marking = this._marking.then(() => this._sendMarksNow()).catch((err) => console.warn("imageInfoSandbox: značky na stránce nejde poslat", err));
	}

	// A failed request is a line of the status until one goes through — except an image the listing on this page no longer
	// shows (another listing came in between; the next request has its marks).
	/** @type {Classes.ExtensionImageInfoSandbox['_sendMarksNow']} */
	async _sendMarksNow() {
		if (!this._allowed(MARK_IMAGES) || !this.isConnected) return;
		/** @type {string | null} */
		let problem = null;
		try {
			await sandboxApi(this).capabilities.call(MARK_IMAGES, this._markImages);
		} catch (err) {
			const text = errorText(err);
			if (text === "notListed") return;
			console.warn("imageInfoSandbox: značky na stránce nejde ukázat", err);
			problem = t("imageInfoSandbox_mark_failed", text);
		}
		if (problem === this._markProblem || !this.isConnected) return;
		this._markProblem = problem;
		this._render();
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_announceNow']} */
	async _announceNow(page) {
		if (!NOTICE_TAGS.some((tag) => this._notices[tag].notify)) {
			// Notifications turned off — their problem goes away with them.
			if (this._notifyProblem !== null && this.isConnected) {
				this._notifyProblem = null;
				this._render();
			}
			return;
		}
		const documentKey = noticeDocument(page);
		if (!page || !page.tab || documentKey === null) return;
		if (this._announced.document !== documentKey) this._announced = { document: documentKey, keys: new Set() };
		if (newNotices(page, this._notices, this._announced.keys, this._limits).length === 0) return;
		const stored = await this.api.state.get(NOTICE_STATE_KEY, /** @type {unknown} */ ([]));
		const keys = newNotices(page, this._notices, announcedKeys(stored, documentKey), this._limits);
		const remembered = rememberNotices(stored, documentKey, keys);
		const all = announcedKeys(remembered, documentKey);
		this._announced = { document: documentKey, keys: all };
		if (keys.length === 0) return;
		await this.api.state.set(NOTICE_STATE_KEY, remembered);
		const { images, counts } = countNotices(all);
		const properties = NOTICE_TAGS.filter((tag) => counts[tag]).map((tag) => `${noticeTagText(tag)}: ${formatCount(counts[tag] ?? 0)}`);
		/** @type {string | null} */
		let problem = null;
		try {
			/** @type {Types.ImageInfoSandbox.NoticeClick} */
			const data = { tabId: page.tab.tabId, document: documentKey, images: announcedImages(all, NOTICE_MAX_IMAGES) };
			await this.api.notifications.show(tp("imageInfoSandbox_notify_title", images, formatCount(images)), {
				body: [properties.join(" · "), page.tab.title || page.tab.url || ""].filter(Boolean).join("\n"),
				tag: `${MODULE_NAME} ${documentKey}`,
				silent: true,
				lang: getUiLocale(),
				data,
			});
		} catch (err) {
			console.warn("imageInfoSandbox: oznámení nejde zobrazit", err);
			problem = t("imageInfoSandbox_notify_failed", errorText(err));
		}
		if (problem === this._notifyProblem || !this.isConnected) return;
		this._notifyProblem = problem;
		this._render();
	}

	// The matches of the serial numbers of the page with the permanent records (serialMatches() of format.mjs) — one search after
	// another: after every listing, a change of the settings and a change of the records.
	/** @type {Classes.ExtensionImageInfoSandbox['_findMatches']} */
	_findMatches(page) {
		this._matching = this._matching.then(() => this._findMatchesNow(page)).catch((err) => console.warn("imageInfoSandbox: shody sériových čísel nejde najít", err));
	}

	// The records of every serial number of the page, of the camera and of the lens (_recordsOfSerial() — one key for both
	// kinds; from the core once for every change of the records) with the records the section has loaded (also those of
	// version 1, stored under the key of the image); none while the module is not active or the records have not been loaded yet. A changed result draws the list again (the badge, the section of the
	// details), then the notification (_announceMatches()). The result of a page the listing no longer shows is dropped — the
	// search of the newer listing follows.
	/** @type {Classes.ExtensionImageInfoSandbox['_findMatchesNow']} */
	async _findMatchesNow(page) {
		/** @type {Types.ImageInfoSandbox.SerialMatch[]} */
		let matches = [];
		if (page && this._recordsReady && this.isActivationSatisfied()) {
			const serials = [...new Set(page.images.flatMap((image) => SERIAL_KINDS.flatMap((kind) => serialIds(image, kind))))];
			if (serials.length > 0) {
				/** @type {Map<number, Types.ImageInfoSandbox.RecordEntry>} */
				const known = new Map(this._records.map((entry) => [entry.id, entry]));
				for (const entries of await Promise.all(serials.map((serial) => this._recordsOfSerial(serial)))) {
					for (const entry of entries) known.set(entry.id, entry);
				}
				matches = serialMatches(page, known.values());
			}
		}
		if (page !== (this._result ? this._result.page : null) || !this.isConnected) return;
		const json = JSON.stringify(matches.map(({ image, serials, records }) => [image.key, serials, records.map((entry) => entry.id)]));
		if (json !== this._matchJson) {
			this._matchJson = json;
			this._matches = new Map(matches.map((match) => [match.image.key, match]));
			this._renderList();
		}
		await this._announceMatches(page, matches);
	}

	// The permanent records of a serial number (api.data.findByKey() under its key, the newest MAX_SERIAL_RECORDS) — read once
	// until the records change (_loadRecords() forgets them); a failure is no records (and is read again next time).
	/** @type {Classes.ExtensionImageInfoSandbox['_recordsOfSerial']} */
	_recordsOfSerial(serial) {
		const known = this._serialRecords.get(serial);
		if (known) return known;
		/** @type {Promise<Types.ImageInfoSandbox.RecordEntry[]>} */
		const found = this.api.data.findByKey({ key: serialRecordKey(serial), limit: MAX_SERIAL_RECORDS }).then(
			(entries) =>
				entries.flatMap((entry) => {
					const read = readRecordEntry(entry);
					return read ? [read] : [];
				}),
			(err) => {
				console.warn("imageInfoSandbox: záznamy sériového čísla nejde načíst", err);
				if (this._serialRecords.get(serial) === found) this._serialRecords.delete(serial);
				return [];
			}
		);
		this._serialRecords.set(serial, found);
		return found;
	}

	// The notification of the matches (the settings "Notify about a found match of the camera serial number" and the same of the
	// lens — only the matches of the kinds whose setting is on, matchesOfKinds()): the keys of the images and their serial
	// numbers the document has not announced yet (newMatches()) — first by what this listing knows, then by
	// the ones remembered for all surfaces in api.state (MATCH_STATE_KEY). The new ones go there, and one silent notification says
	// how many images of the page have a match and where the records of their serial numbers are from (a newer one of the document
	// replaces it — the same tag, not the one of the notices). A notification that cannot be shown is a line of the status with
	// the button to Settings until one is shown; turning the setting off takes the line away.
	/** @type {Classes.ExtensionImageInfoSandbox['_announceMatches']} */
	async _announceMatches(page, found) {
		const kinds = new Set(SERIAL_KINDS.filter((kind) => this._matchNotify[kind]));
		if (kinds.size === 0) {
			if (this._matchProblem !== null && this.isConnected) {
				this._matchProblem = null;
				this._render();
			}
			return;
		}
		const documentKey = noticeDocument(page);
		const matches = matchesOfKinds(found, kinds);
		if (!page || !page.tab || documentKey === null || matches.length === 0) return;
		if (this._matchAnnounced.document !== documentKey) this._matchAnnounced = { document: documentKey, keys: new Set() };
		if (newMatches(matches, this._matchAnnounced.keys).length === 0) return;
		const stored = await this.api.state.get(MATCH_STATE_KEY, /** @type {unknown} */ ([]));
		const keys = newMatches(matches, announcedKeys(stored, documentKey));
		const remembered = rememberNotices(stored, documentKey, keys);
		this._matchAnnounced = { document: documentKey, keys: announcedKeys(remembered, documentKey) };
		if (keys.length === 0) return;
		await this.api.state.set(MATCH_STATE_KEY, remembered);
		const summary = matchSummary(matches);
		const lines = summary.slice(0, MATCH_NOTIFY_LINES).map((item) => t("imageInfoSandbox_match_line", serialLabel(item), item.places.join(", ")));
		if (summary.length > MATCH_NOTIFY_LINES) lines.push("…");
		/** @type {string | null} */
		let problem = null;
		try {
			/** @type {Types.ImageInfoSandbox.NoticeClick} */
			const data = { tabId: page.tab.tabId, document: documentKey, images: matches.map((match) => match.image.key).slice(-NOTICE_MAX_IMAGES) };
			await this.api.notifications.show(tp("imageInfoSandbox_match_notify_title", matches.length, formatCount(matches.length)), {
				body: [...lines, page.tab.title || page.tab.url || ""].filter(Boolean).join("\n"),
				tag: `${MODULE_NAME} match ${documentKey}`,
				silent: true,
				lang: getUiLocale(),
				data,
			});
		} catch (err) {
			console.warn("imageInfoSandbox: oznámení o shodě sériového čísla nejde zobrazit", err);
			problem = t("imageInfoSandbox_match_notify_failed", errorText(err));
		}
		if (problem === this._matchProblem || !this.isConnected) return;
		this._matchProblem = problem;
		this._render();
	}

	// A tab with an image alone (an image opened in it, not an HTML page): in the side panel, on the dashboard and in the floating window the
	// page scrolls to this listing — once for the image (the user may scroll away), again after another page.
	/** @type {Classes.ExtensionImageInfoSandbox['_scrollToImagePage']} */
	_scrollToImagePage(page) {
		const key = page.tab && isImagePage(page) ? `${page.tab.tabId} ${page.tab.url}` : null;
		if (key === this._scrolledFor) return;
		this._scrolledFor = key;
		if (key === null || (!followsActiveTab(this._location) && this._location !== "floating")) return;
		sandboxApi(this)
			.ui.scrollIntoView()
			.catch((err) => console.warn("imageInfoSandbox: na výpis nejde posunout", err));
	}

	// What the listing of the page lacks and why: the frames, the headers, the metadata of other origins.
	/** @type {Classes.ExtensionImageInfoSandbox['_renderPageStatus']} */
	_renderPageStatus(page) {
		const { status } = page;
		if (page.error === "notWebPage") {
			this._statusLine(t("imageInfoSandbox_not_web_page", page.tab?.url ?? ""));
			return;
		}
		if (page.error === "noAccess") this._statusLine(t("imageInfoSandbox_no_access"), "warning", true);
		else if (page.error === "inject") this._statusLine(t("imageInfoSandbox_inject_failed", page.errorDetail ?? ""), "warning");
		else if (page.error === "noTab") this._statusLine(t("imageInfoSandbox_no_tab"));
		else if (page.error === "notClicked") this._statusLine(t("imageInfoSandbox_not_clicked"), "note");
		if (status.headers === "off") this._statusLine(t("imageInfoSandbox_headers_off"), "note", true);
		else if (status.headers === "noPermission") this._statusLine(t("imageInfoSandbox_headers_no_permission"), "warning", true);
		else if (status.listening && !status.persistent) this._statusLine(t("imageInfoSandbox_not_persistent"), "note");
		if (status.capture === "noPermission") this._statusLine(t("imageInfoSandbox_capture_no_permission"), "warning", true);
		const crossOrigin = page.images.filter((image) => image.file && image.file.source === null && image.file.error === "crossOrigin").length;
		if (crossOrigin > 0) {
			if (status.browser === "chrome") this._statusLine(tp("imageInfoSandbox_cross_origin_chrome", crossOrigin, formatCount(crossOrigin)), "note");
			else if (status.capture === "off") this._statusLine(tp("imageInfoSandbox_cross_origin_firefox", crossOrigin, formatCount(crossOrigin)), "note", true);
		}
		// Files the browser does not keep (no-store) — in Firefox reading while they load gets them.
		const notCached = page.images.filter((image) => image.file && image.file.source === null && image.file.error === "notCached" && !notLoaded(image)).length;
		if (notCached > 0 && status.browser === "firefox" && status.capture === "off") this._statusLine(tp("imageInfoSandbox_not_cached_firefox", notCached, formatCount(notCached)), "note", true);
		if (status.capture !== "on" && page.images.some((image) => image.file && image.file.source === null && image.file.error === "csp")) {
			this._statusLine(t("imageInfoSandbox_csp"), "note", status.capture === "off");
		}
		if (page.frames.some((frame) => frame.truncated.length > 0)) this._statusLine(t("imageInfoSandbox_truncated"), "note");
	}

	// The images the list shows — those that match the search, without the ones listed before the page changed its address
	// (cleaning dynamically), without the ones not on the page and the small ones when they are hidden — and how many of each
	// it leaves out. An image removed from the page stays even with "Hide images not on the page", and an image with a
	// property whose "Never hide" is on (isKept()) always. With "Only important" (while some property is important) the
	// checkboxes work together instead: the list shows only the important images that no other checked box hides. The image
	// under the pointer on the page (imageInfo.onView) is not hidden — it is among the revealed ones then.
	/** @type {Classes.ExtensionImageInfoSandbox['_shownImages']} */
	_shownImages(page) {
		const counts = { cleared: 0, unused: 0, small: 0, unimportant: 0 };
		/** @type {string[]} */
		const revealed = [];
		const context = noticeContext(page, this._limits);
		const onlyImportant = this._onlyImportant && NOTICE_TAGS.some((tag) => this._notices[tag].keep);
		// The images of a clicked notification of this document stay shown (_applyNoticeOpen()).
		const noticed = this._noticeShown && this._noticeShown.document === noticeDocument(page) ? this._noticeShown.keys : null;
		const shown = page.images.filter((image) => {
			if (!matchesFilter(image, this._filter)) return false;
			const kept = isKept(image, this._notices, context);
			/** @type {keyof typeof counts | null} */
			const hidden =
				this._cleanDynamic && isCleared(image, this._cleaning)
					? "cleared"
					: this._hideUnused && image.usageCount === 0 && !isRemoved(image)
						? "unused"
						: this._small.ignore && isSmallImage(image, this._small.width, this._small.height)
							? "small"
							: onlyImportant && !kept
								? "unimportant"
								: null;
			if (!hidden || (kept && !onlyImportant)) return true;
			if (this._view.hovered.has(image.key) || (noticed && noticed.has(image.key))) {
				revealed.push(image.key);
				return true;
			}
			counts[hidden]++;
			return false;
		});
		return { shown, revealed, ...counts };
	}

	// The number of images (shown / all, the small ones left out), their size, the page and the time of the listing.
	/** @type {Classes.ExtensionImageInfoSandbox['_renderSummary']} */
	_renderSummary() {
		const page = this._result ? this._result.page : null;
		if (!page) {
			this._summaryEl.textContent = "";
			return;
		}
		const { shown, small, unused, cleared, unimportant } = this._shownImages(page);
		const bytes = page.images.reduce((sum, image) => sum + (imageBytes(image) ?? 0), 0);
		const count = shown.length === page.images.length ? tp("imageInfoSandbox_count", page.images.length, formatCount(page.images.length)) : t("imageInfoSandbox_shown", formatCount(shown.length), formatCount(page.images.length));
		this._summaryEl.textContent = [
			count,
			small ? tp("imageInfoSandbox_small_hidden", small, formatCount(small)) : "",
			unused ? tp("imageInfoSandbox_unused_hidden", unused, formatCount(unused)) : "",
			cleared ? tp("imageInfoSandbox_cleared_hidden", cleared, formatCount(cleared)) : "",
			unimportant ? tp("imageInfoSandbox_unimportant_hidden", unimportant, formatCount(unimportant)) : "",
			bytes ? formatBytes(bytes) : "",
			t("imageInfoSandbox_collected", formatTime(page.collectedAt)),
		]
			.filter(Boolean)
			.join(" · ");
		this._summaryEl.title = page.tab?.url ?? "";
	}

	// The list of the images (filtered, sorted); the expanded ones stay expanded with their details.
	/** @type {Classes.ExtensionImageInfoSandbox['_renderList']} */
	_renderList() {
		const page = this._result ? this._result.page : null;
		this._listEl.textContent = "";
		this._items.clear();
		this._listRecorded = recordedSignature(this._recorded);
		if (!page) return;
		this._renderSummary();
		if (page.images.length === 0) {
			if (!page.error) this._listEl.appendChild(create("li", "iis-list__empty", t("imageInfoSandbox_empty")));
			return;
		}
		const order = new Map(page.images.map((image, index) => [image.key, index + 1]));
		const { shown, revealed, small, unused, cleared, unimportant } = this._shownImages(page);
		const images = sortImages(shown, this._sort);
		// A single image in the list is shown whole — expanded with all the groups of its metadata; once, then as the user
		// leaves it (another listing of the same image does not expand it again). The images the page only loaded do not count
		// when it uses one — the icon of the tab the browser loads itself (/favicon.ico) is not an image of the page. Once the
		// list has more images, the image expanded this way collapses again (with the groups it expanded) — unless the user
		// collapsed it in between; an image the user expanded stays expanded. An image shown only while it is under the
		// pointer does not count either.
		const settled = images.filter((image) => !revealed.includes(image.key));
		const used = settled.filter((image) => image.usageCount > 0);
		const candidates = used.length > 0 ? used : settled;
		const single = candidates.length === 1 ? candidates[0] : null;
		if ((single ? single.key : null) !== this._expandedSingle) {
			this._expandedSingle = single ? single.key : null;
			if (this._autoOpened && this._autoOpened.key !== this._expandedSingle) {
				this._open.delete(this._autoOpened.key);
				for (const key of this._autoOpened.groups) this._openGroups.delete(key);
				this._autoOpened = null;
			}
			if (single) {
				const groups = (metadataOf(single)?.groups ?? []).map((group) => groupKey(single.key, group.id)).filter((key) => !this._openGroups.has(key));
				for (const key of groups) this._openGroups.add(key);
				if (!this._open.has(single.key)) {
					this._open.add(single.key);
					this._autoOpened = { key: single.key, groups };
				}
			}
		}
		if (images.length === 0) {
			this._listEl.appendChild(create("li", "iis-list__empty", this._filter.trim() ? t("imageInfoSandbox_no_match") : unused > 0 || cleared > 0 || unimportant > 0 ? t("imageInfoSandbox_all_hidden") : small > 0 ? t("imageInfoSandbox_all_small") : t("imageInfoSandbox_no_match")));
			return;
		}
		for (const image of images) {
			const item = this._listEl.appendChild(this._createItem(image, order.get(image.key) ?? 0));
			if (revealed.includes(image.key)) item.classList.add("iis-item--revealed");
		}
	}

	// One image: its line (the name, the facts, the badges; highlighted while the page shows it) and the details built when it
	// is expanded.
	/** @type {Classes.ExtensionImageInfoSandbox['_createItem']} */
	_createItem(image, index) {
		const item = create("li", isRemoved(image) ? "iis-item iis-item--removed" : "iis-item");
		this._items.set(image.key, item);
		this._highlight(item, image.key);
		const details = document.createElement("details");
		details.className = "iis-item__details";
		const summary = document.createElement("summary");
		summary.className = "iis-item__summary";
		summary.append(create("span", "iis-item__index", String(index)), create("span", "iis-item__name", fileName(image.url)), create("span", "iis-item__facts", facts(image)));
		summary.title = image.url;
		const list = chips(image, this._notices, noticeContext(this._result ? this._result.page : null, this._limits));
		// A permanently recorded image (as far as the listing knows its records) — 📌.
		const recorded = this._recorded.get(image.key);
		if (recorded) list.push(["record", "📌", t("imageInfoSandbox_chip_recorded_title", formatTime(recorded.record.recordedAt))]);
		// Its serial number of the camera, of the lens has a permanent record of another image from another page — a badge of each.
		const match = this._matches.get(image.key);
		if (match) {
			const summary = matchSummary([match]);
			for (const kind of SERIAL_KINDS) {
				const places = summary.filter((item) => item.kind === kind).map((item) => t("imageInfoSandbox_match_line", serialLabel(item), item.places.join(", ")));
				if (places.length > 0) list.push(["warning", t(MATCH_CHIPS[kind][0]), t(MATCH_CHIPS[kind][1], places.join("\n"))]);
			}
		}
		summary.appendChild(chipsElement(list));
		details.appendChild(summary);
		const fill = () => {
			if (!details.open || details.dataset.filled) return;
			details.dataset.filled = "1";
			details.appendChild(this._createBody(image));
		};
		details.addEventListener("toggle", () => {
			// The toggle of an item already replaced by another listing (details.open set below) changes nothing.
			if (!details.isConnected) return;
			if (details.open) this._open.add(image.key);
			else {
				this._open.delete(image.key);
				if (this._autoOpened?.key === image.key) this._autoOpened = null;
			}
			fill();
		});
		if (this._open.has(image.key)) {
			details.open = true;
			fill();
		}
		item.appendChild(details);
		return item;
	}

	// The details of an image: the address, where the page uses it, the loading, the headers, the metadata.
	/** @type {Classes.ExtensionImageInfoSandbox['_createBody']} */
	_createBody(image) {
		const body = create("div", "iis-item__body");
		body.appendChild(this._fetchSection(image));
		const match = this._matchSection(image);
		if (match) body.appendChild(match);
		body.append(this._addressSection(image), this._thumbnailSection(image), this._usagesSection(image), this._loadingSection(image), this._headersSection(image), this._metadataSection(image));
		return body;
	}

	// The section "Serial number match" of an image with a match (null = none): the matching records — the serial number with
	// its kind (of the camera, of the lens), the file, the page it was recorded on (a link) and when.
	/** @type {Classes.ExtensionImageInfoSandbox['_matchSection']} */
	_matchSection(image) {
		const match = this._matches.get(image.key);
		if (!match) return null;
		const list = create("ul", "iis-matches");
		for (const { record } of match.records) {
			const item = create("li");
			const serials = match.serials.filter((ref) => recordSerials(record, ref.kind).includes(ref.serial)).map(serialLabel);
			const label = recordPageLabel(record.page);
			const page = record.page.url ? createUrlNode(record.page.url, label && label !== record.page.url ? `${label} — ${record.page.url}` : record.page.url) : document.createTextNode(label);
			item.append(`${serials.join(", ")} · `, createUrlNode(record.image.url, fileName(record.image.url)), " · ", page, ` · ${formatTime(record.recordedAt)}`);
			list.appendChild(item);
		}
		return section(t("imageInfoSandbox_section_serial_match"), create("p", "iis-note", t("imageInfoSandbox_match_note")), list);
	}

	// The buttons of an image. "Load information" when the headers or the metadata are missing — the background part of
	// imageInfo downloads the image once more (imageInfo.fetchImage), then the page is listed again with them. "Save" when
	// the browser has the file (canSaveFromBrowser — it is not downloaded again), otherwise "Download" (imageInfo.saveImage).
	// With "Anonymously" checked both go without cookies (credentials: "omit"); the choice holds for all images until the
	// listing closes. "Record permanently" before them (the permanent records — nothing is downloaded). "Remove from the
	// document" (imageInfo.removeImage) for an image the page uses — disabled once it is removed. "Block the image
	// permanently" (imageInfo.blockImage) for an http(s) image.
	/** @type {Classes.ExtensionImageInfoSandbox['_fetchSection']} */
	_fetchSection(image) {
		const box = create("div", "iis-fetch");
		const fetchable = canFetch(image);
		// How the button "Record permanently" ended stays while the image is recorded (the list may be drawn again).
		const recordNote = this._recorded.has(image.key) ? this._recordNotes.get(image.key) : undefined;
		const note = create("span", "iis-fetch__note", recordNote ?? (fetchable ? t("imageInfoSandbox_fetch_note") : ""));
		if (fetchable) {
			const button = create("button", "iis-fetch__button");
			this._labelButton(button, t("imageInfoSandbox_fetch_button"));
			button.type = "button";
			const allowed = this._allowed(FETCH_IMAGE);
			button.title = allowed ? t("imageInfoSandbox_fetch_title") : t("imageInfoSandbox_fetch_not_allowed");
			button.disabled = !allowed || this._fetching.has(image.key);
			if (this._fetching.has(image.key)) this._busyButton(button, t("imageInfoSandbox_fetch_busy"));
			button.addEventListener("click", () => void this._fetchImage(image, button, note));
			box.append(button);
		}
		box.append(this._recordButton(image, note));
		const fromBrowser = canSaveFromBrowser(image);
		const save = create("button", "iis-fetch__button iis-fetch__save");
		this._labelButton(save, t(fromBrowser ? "imageInfoSandbox_save_button" : "imageInfoSandbox_download_button"));
		save.type = "button";
		const saveAllowed = this._allowed(SAVE_IMAGE);
		save.title = saveAllowed ? t(fromBrowser ? "imageInfoSandbox_save_title" : "imageInfoSandbox_download_title") : t("imageInfoSandbox_fetch_not_allowed");
		save.disabled = !saveAllowed || this._saving.has(image.key);
		if (this._saving.has(image.key)) this._busyButton(save, t("imageInfoSandbox_save_busy"));
		save.addEventListener("click", () => void this._saveImage(image, save, note, fromBrowser));
		const allowed = fetchable ? this._allowed(FETCH_IMAGE) || saveAllowed : saveAllowed;
		const label = create("label", "iis-fetch__anonymous");
		label.title = t("imageInfoSandbox_fetch_anonymous_title");
		const checkbox = create("input");
		checkbox.type = "checkbox";
		checkbox.checked = this._fetchAnonymous;
		checkbox.disabled = !allowed;
		checkbox.addEventListener("change", () => {
			this._fetchAnonymous = checkbox.checked;
			for (const other of this.querySelectorAll(".iis-fetch__anonymous input")) /** @type {HTMLInputElement} */ (other).checked = checkbox.checked;
			for (const button of this.querySelectorAll("button[data-label]")) {
				this._labelButton(/** @type {HTMLButtonElement} */ (button), /** @type {HTMLButtonElement} */ (button).dataset.label ?? "");
			}
		});
		label.append(checkbox, ` ${t("imageInfoSandbox_fetch_anonymous")}`);
		box.append(save, label);
		if (image.usageCount > 0 || isRemoved(image)) box.append(this._removeButton(image, note));
		if (canBlock(image) && this._result?.blockReason !== "rulesUnavailable") box.append(this._blockButton(image, note));
		box.append(note);
		return box;
	}

	// Disabled while the function is not allowed, or while the module declarativeNetRequest, which does the blocking, is not in
	// the module list or is turned off (blockReason of the listing — the core would not ask it); the tip says why.
	/** @type {Classes.ExtensionImageInfoSandbox['_blockButton']} */
	_blockButton(image, note) {
		const button = create("button", "iis-fetch__button iis-fetch__block", t("imageInfoSandbox_block_button"));
		button.type = "button";
		const allowed = this._allowed(BLOCK_IMAGE);
		const blockReason = this._result && this._result.blockReason !== "rulesUnavailable" ? this._result.blockReason : null;
		button.title = !allowed ? t("imageInfoSandbox_block_not_allowed") : blockReason ? BLOCK_REASONS[blockReason]() : t("imageInfoSandbox_block_title");
		button.disabled = !allowed || blockReason !== null || this._blocking.has(image.key);
		if (this._blocking.has(image.key)) button.textContent = t("imageInfoSandbox_block_busy");
		button.addEventListener("click", () => void this._blockImage(image, button, note));
		return button;
	}

	// Blocks the image permanently — the core hands its address over to the rule of the blocked images of declarativeNetRequest;
	// the note says whether the browser now blocks it, or why not. The listing stays as it is: the page keeps the image it has.
	/** @type {Classes.ExtensionImageInfoSandbox['_blockImage']} */
	async _blockImage(image, button, note) {
		if (this._blocking.has(image.key)) return;
		this._blocking.add(image.key);
		button.disabled = true;
		button.textContent = t("imageInfoSandbox_block_busy");
		note.classList.remove("iis-fetch__note--error");
		/** @type {string} */
		let text;
		let problem = true;
		/** @type {Exclude<Types.SandboxImageInfoBlockReason, "rulesUnavailable"> | null} */
		let unavailable = null;
		try {
			const result = /** @type {Types.SandboxImageInfoBlock} */ (await sandboxApi(this).capabilities.call(BLOCK_IMAGE, image.url));
			if (result.reason === "rulesNotListed" || result.reason === "rulesDisabled") {
				// The listing did not know yet (it is not following the page, or the change has not come yet) — the button
				// stays disabled; the next listing disables it for every image.
				unavailable = result.reason;
				text = BLOCK_REASONS[unavailable]();
			} else if (result.reason !== null || !result.rule) {
				// imageInfo itself is not in the module list or is turned off — the listing says so; the extension does not have
				// declarativeNetRequest at all ("rulesUnavailable") — the listing leaves the button out.
				this._blocking.delete(image.key);
				this._shownJson = null;
				await this._refresh();
				return;
			} else {
				const { title, added } = result.rule;
				problem = result.rule.problem !== null;
				text = result.rule.problem ? BLOCK_PROBLEMS[result.rule.problem](title) : t(added ? "imageInfoSandbox_block_done" : "imageInfoSandbox_block_already", title);
			}
		} catch (err) {
			const message = errorText(err);
			text = message === "notListed" ? t("imageInfoSandbox_fetch_not_listed") : t("imageInfoSandbox_block_failed", message);
		}
		this._blocking.delete(image.key);
		note.textContent = text;
		note.classList.toggle("iis-fetch__note--error", problem);
		button.disabled = unavailable !== null;
		if (unavailable) button.title = text;
		button.textContent = t("imageInfoSandbox_block_button");
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_removeButton']} */
	_removeButton(image, note) {
		const button = create("button", "iis-fetch__button iis-fetch__remove", t("imageInfoSandbox_remove_button"));
		button.type = "button";
		const allowed = this._allowed(REMOVE_IMAGE);
		const onPage = image.usageCount > 0;
		button.title = !allowed ? t("imageInfoSandbox_remove_not_allowed") : onPage ? t("imageInfoSandbox_remove_title") : t("imageInfoSandbox_remove_done_title");
		button.disabled = !allowed || !onPage || this._removing.has(image.key);
		if (this._removing.has(image.key)) button.textContent = t("imageInfoSandbox_remove_busy");
		button.addEventListener("click", () => void this._removeImage(image, button, note));
		return button;
	}

	// Removes the image from the page; then the page is listed again — the image stays in the listing marked removed. When
	// nothing was removed (the page no longer has it where it was listed) the note says so.
	/** @type {Classes.ExtensionImageInfoSandbox['_removeImage']} */
	async _removeImage(image, button, note) {
		if (this._removing.has(image.key)) return;
		this._removing.add(image.key);
		button.disabled = true;
		button.textContent = t("imageInfoSandbox_remove_busy");
		note.classList.remove("iis-fetch__note--error");
		try {
			const result = /** @type {Types.SandboxImageInfoRemove} */ (await sandboxApi(this).capabilities.call(REMOVE_IMAGE, image.url));
			this._removing.delete(image.key);
			if (result.reason === null && result.removed === 0) {
				note.textContent = t("imageInfoSandbox_remove_none");
				note.classList.add("iis-fetch__note--error");
				button.disabled = false;
				button.textContent = t("imageInfoSandbox_remove_button");
				return;
			}
			this._shownJson = null;
			await this._refresh();
		} catch (err) {
			this._removing.delete(image.key);
			const text = errorText(err);
			note.textContent = text === "notListed" ? t("imageInfoSandbox_fetch_not_listed") : t("imageInfoSandbox_remove_failed", text);
			note.classList.add("iis-fetch__note--error");
			button.disabled = false;
			button.textContent = t("imageInfoSandbox_remove_button");
		}
	}

	// The label of a button that acts by "anonymously": with ANONYMOUS_PREFIX while the checkbox is checked (the change of
	// the checkbox labels all of them again — data-label). A busy button keeps its text without the prefix (_busyButton()).
	/** @type {Classes.ExtensionImageInfoSandbox['_labelButton']} */
	_labelButton(button, text) {
		button.dataset.label = text;
		delete button.dataset.idle;
		button.textContent = this._fetchAnonymous ? `${ANONYMOUS_PREFIX}${text}` : text;
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_busyButton']} */
	_busyButton(button, text) {
		if (button.dataset.label !== undefined) button.dataset.idle = button.dataset.label;
		delete button.dataset.label;
		button.textContent = text;
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_saveImage']} */
	async _saveImage(image, button, note, fromBrowser) {
		if (this._saving.has(image.key)) return;
		this._saving.add(image.key);
		const label = button.dataset.label ?? button.dataset.idle ?? "";
		button.disabled = true;
		this._busyButton(button, t("imageInfoSandbox_save_busy"));
		note.classList.remove("iis-fetch__note--error");
		try {
			const result = /** @type {Types.SandboxImageInfoSave} */ (await sandboxApi(this).capabilities.call(SAVE_IMAGE, image.url, { anonymous: this._fetchAnonymous }));
			note.textContent =
				result.source === "browser"
					? t("imageInfoSandbox_saved_browser")
					: result.source === "network"
						? t(fromBrowser ? "imageInfoSandbox_saved_fallback" : "imageInfoSandbox_saved_network")
						: t("imageInfoSandbox_save_failed", result.reason ?? "noTab");
			if (result.source === null) note.classList.add("iis-fetch__note--error");
		} catch (err) {
			const text = errorText(err);
			note.textContent =
				text === "notListed" ? t("imageInfoSandbox_fetch_not_listed") : text === "tooLarge" ? t("imageInfoSandbox_save_too_large") : t("imageInfoSandbox_save_failed", text);
			note.classList.add("iis-fetch__note--error");
		} finally {
			this._saving.delete(image.key);
			button.disabled = false;
			this._labelButton(button, label);
		}
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_fetchImage']} */
	async _fetchImage(image, button, note) {
		if (this._fetching.has(image.key)) return;
		this._fetching.add(image.key);
		button.disabled = true;
		this._busyButton(button, t("imageInfoSandbox_fetch_busy"));
		note.classList.remove("iis-fetch__note--error");
		try {
			await sandboxApi(this).capabilities.call(FETCH_IMAGE, image.url, { anonymous: this._fetchAnonymous });
			this._fetching.delete(image.key);
			// The same listing could look unchanged (an error status) — it is drawn again either way.
			this._shownJson = null;
			await this._refresh();
		} catch (err) {
			this._fetching.delete(image.key);
			const text = errorText(err);
			note.textContent = text === "notListed" ? t("imageInfoSandbox_fetch_not_listed") : t("imageInfoSandbox_fetch_failed", text);
			note.classList.add("iis-fetch__note--error");
			button.disabled = false;
			this._labelButton(button, t("imageInfoSandbox_fetch_button"));
		}
	}

	// The thumbnail (above "On the page"): the file from what the browser already has — read by itself when the details open
	// (imageInfo.readImage) — otherwise the button "Show", which downloads it once more (with "anonymously" without cookies);
	// its headers and metadata then fill the sections below (the page is listed again). It fits the width of the listing
	// and is never enlarged (CSS).
	/** @type {Classes.ExtensionImageInfoSandbox['_thumbnailSection']} */
	_thumbnailSection(image) {
		const box = create("div", "iis-thumb");
		box.dataset.key = image.key;
		this._fillThumbnail(image, box);
		return section(t("imageInfoSandbox_section_thumbnail"), box);
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_fillThumbnail']} */
	_fillThumbnail(image, box) {
		box.replaceChildren();
		const shown = this._thumbs.get(image.key);
		if (shown) {
			const img = create("img", "iis-thumb__img");
			img.alt = fileName(image.url);
			img.addEventListener("error", () => img.replaceWith(create("p", "iis-note", t("imageInfoSandbox_thumb_broken"))));
			img.src = shown;
			box.appendChild(img);
			return;
		}
		if (this._thumbLoading.has(image.key)) {
			box.appendChild(create("p", "iis-note", t("imageInfoSandbox_thumb_loading")));
			return;
		}
		const allowed = this._allowed(READ_IMAGE);
		if (allowed && canSaveFromBrowser(image) && !this._thumbMissing.has(image.key)) {
			box.appendChild(create("p", "iis-note", t("imageInfoSandbox_thumb_loading")));
			void this._loadThumbnail(image, false);
			return;
		}
		if (image.scheme !== "http" && image.scheme !== "https") {
			box.appendChild(create("p", "iis-note", t("imageInfoSandbox_thumb_none")));
			return;
		}
		const row = create("div", "iis-fetch");
		const button = create("button", "iis-fetch__button iis-thumb__show");
		this._labelButton(button, t("imageInfoSandbox_thumb_show"));
		button.type = "button";
		button.title = allowed ? t("imageInfoSandbox_thumb_show_title") : t("imageInfoSandbox_fetch_not_allowed");
		button.disabled = !allowed;
		button.addEventListener("click", () => void this._loadThumbnail(image, true));
		row.appendChild(button);
		const error = this._thumbErrors.get(image.key);
		if (error) row.appendChild(create("span", "iis-fetch__note iis-fetch__note--error", error));
		box.appendChild(row);
	}

	// Reads the file (download = the button "Show"), keeps it as a blob: address and draws every thumbnail box of the image
	// again (the listing may have been drawn again meanwhile). From the browser it falls back to the button when the browser
	// no longer has the file; after a download the page is listed again — its headers and metadata are in the records now.
	/** @type {Classes.ExtensionImageInfoSandbox['_loadThumbnail']} */
	async _loadThumbnail(image, download) {
		if (this._thumbLoading.has(image.key)) return;
		this._thumbLoading.add(image.key);
		this._thumbErrors.delete(image.key);
		const redraw = () => {
			for (const box of this.querySelectorAll(".iis-thumb")) {
				if (/** @type {HTMLElement} */ (box).dataset.key === image.key) this._fillThumbnail(image, /** @type {HTMLDivElement} */ (box));
			}
		};
		if (download) redraw();
		let loaded = false;
		try {
			const result = /** @type {Types.SandboxImageInfoRead} */ (await sandboxApi(this).capabilities.call(READ_IMAGE, image.url, { anonymous: this._fetchAnonymous, download }));
			if (!result.image) throw new Error(result.reason ?? "noTab");
			const type = (result.image.contentType ?? "").split(";")[0].trim();
			this._thumbs.set(
				image.key,
				(await canShowBlobImages())
					? URL.createObjectURL(new Blob([fromBase64(result.image.data)], type ? { type } : {}))
					: `data:${/^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : "application/octet-stream"};base64,${result.image.data}`
			);
			for (const [key, url] of this._thumbs) {
				if (this._thumbs.size <= MAX_THUMBNAILS) break;
				if (url.startsWith("blob:")) URL.revokeObjectURL(url);
				this._thumbs.delete(key);
			}
			loaded = true;
		} catch (err) {
			const text = errorText(err);
			if (download) {
				this._thumbErrors.set(image.key, text === "tooLarge" ? t("imageInfoSandbox_thumb_too_large") : text === "notListed" ? t("imageInfoSandbox_fetch_not_listed") : t("imageInfoSandbox_thumb_failed", text));
			} else {
				this._thumbMissing.add(image.key);
			}
		} finally {
			this._thumbLoading.delete(image.key);
		}
		redraw();
		if (loaded && download) {
			// The same listing could look unchanged — it is drawn again either way.
			this._shownJson = null;
			await this._refresh();
		}
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_addressSection']} */
	_addressSection(image) {
		const origin =
			image.scheme === "data"
				? t("imageInfoSandbox_origin_data")
				: image.scheme === "blob"
					? t("imageInfoSandbox_origin_blob")
					: image.sameOrigin === false
						? t("imageInfoSandbox_origin_cross")
						: image.sameOrigin
							? t("imageInfoSandbox_origin_same")
							: null;
		const address = create("p", "iis-address");
		address.appendChild(createUrlNode(image.url));
		return section(t("imageInfoSandbox_section_address"), address, definitions([[t("imageInfoSandbox_row_origin"), origin]]));
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_usagesSection']} */
	_usagesSection(image) {
		if (image.usages.length === 0) return section(t("imageInfoSandbox_section_usages"), create("p", "iis-note", t("imageInfoSandbox_usage_none")));
		const list = create("ul", "iis-usages");
		for (const usage of image.usages) {
			const item = create("li", usage.removed ? "iis-usage iis-usage--removed" : "iis-usage");
			const head = create("p", "iis-usage__head");
			head.append(create("strong", "", USAGE_KINDS[usage.kind]()), " ");
			if (usage.element) head.appendChild(create("code", "", usage.element));
			if (usage.property) head.append(" ", create("code", "", usage.property));
			if (usage.removed) head.append(" ", create("span", "iis-chip iis-chip--removed", t("imageInfoSandbox_chip_removed")));
			else if (usage.label === null && this._notices.noLabel.badge) {
				const chip = create("span", "iis-chip iis-chip--warning", t("imageInfoSandbox_chip_no_label"));
				chip.title = t("imageInfoSandbox_chip_no_label_title");
				head.append(" ", chip);
			}
			item.appendChild(head);
			const rendered = usage.renderedWidth !== undefined && usage.renderedHeight !== undefined ? size(usage.renderedWidth, usage.renderedHeight) : null;
			item.appendChild(
				definitions([
					[t("imageInfoSandbox_row_rendered"), rendered === null ? null : usage.renderedWidth === 0 || usage.renderedHeight === 0 ? `${rendered} (${t("imageInfoSandbox_usage_hidden")})` : usage.inViewport === false ? `${rendered} (${t("imageInfoSandbox_usage_offscreen")})` : rendered],
					[t("imageInfoSandbox_row_natural"), usage.naturalWidth && usage.naturalHeight ? size(usage.naturalWidth, usage.naturalHeight) : null],
					["alt", usage.alt === "" ? t("imageInfoSandbox_usage_empty_alt") : usage.alt ?? null],
					["title", usage.title ?? null],
					["src", usage.src && usage.src !== image.url ? usage.src : null],
					["width", usage.width ?? null],
					["height", usage.height ?? null],
					["srcset", usage.srcset ?? null],
					["sizes", usage.sizes ?? null],
					["loading", usage.loading ?? null],
					["decoding", usage.decoding ?? null],
					["fetchpriority", usage.fetchPriority ?? null],
					["crossorigin", usage.crossOrigin ?? null],
					["referrerpolicy", usage.referrerPolicy ?? null],
					["type", usage.type ?? null],
					[t("imageInfoSandbox_row_loaded"), usage.complete === undefined ? null : yesNo(usage.complete)],
					[
						"<source>",
						usage.sources && usage.sources.length
							? usage.sources.map((source) => [source.media && `media="${source.media}"`, source.type && `type="${source.type}"`, source.srcset && `srcset="${source.srcset}"`].filter(Boolean).join(" ")).join("\n")
							: null,
					],
					[t("imageInfoSandbox_row_frame"), usage.frameId ? usage.frameUrl ?? String(usage.frameId) : null],
				])
			);
			list.appendChild(item);
		}
		/** @type {Node[]} */
		const content = [list];
		if (image.usageCount > image.usages.length) content.push(create("p", "iis-note", t("imageInfoSandbox_usage_more", formatCount(image.usageCount - image.usages.length))));
		return section(t("imageInfoSandbox_section_usages"), ...content);
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_loadingSection']} */
	_loadingSection(image) {
		const { network, timing } = image;
		const status = network ? network.statusLine || (network.statusCode !== null ? String(network.statusCode) : null) : timing && timing.responseStatus ? String(timing.responseStatus) : null;
		const cached = fromCache(image);
		const redirects = network && network.redirects && network.redirects.length ? network.redirects : null;
		const rows = definitions([
			[t("imageInfoSandbox_row_status"), status],
			[t("imageInfoSandbox_row_redirects"), redirects ? [...redirects.map((hop) => `${hop.statusCode ?? "?"} ${hop.url}`), `→ ${network?.finalUrl ?? ""}`].join("\n") : null],
			[t("imageInfoSandbox_row_error"), network ? network.error : null],
			[t("imageInfoSandbox_row_method"), network && network.method !== "GET" ? network.method : null],
			[t("imageInfoSandbox_row_from_cache"), yesNo(cached)],
			[t("imageInfoSandbox_row_ip"), network ? network.ip : null],
			[t("imageInfoSandbox_row_protocol"), timing ? timing.nextHopProtocol : null],
			[t("imageInfoSandbox_row_duration"), timing ? `${formatCount(timing.duration)} ms` : null],
			[t("imageInfoSandbox_row_transferred"), timing && timing.transferSize > 0 ? formatBytes(timing.transferSize) : null],
			[t("imageInfoSandbox_row_encoded"), timing && timing.encodedBodySize > 0 ? formatBytes(timing.encodedBodySize) : null],
			[t("imageInfoSandbox_row_decoded"), timing && timing.decodedBodySize > 0 && timing.decodedBodySize !== timing.encodedBodySize ? formatBytes(timing.decodedBodySize) : null],
			[t("imageInfoSandbox_row_initiator"), [timing ? timing.initiatorType : null, network ? network.initiator : null].filter(Boolean).join(" · ") || null],
			[t("imageInfoSandbox_row_requests"), timing && timing.count > 1 ? formatCount(timing.count) : null],
			[t("imageInfoSandbox_row_recorded"), network ? formatTime(network.completedAt) : null],
		]);
		/** @type {Node[]} */
		const content = [rows];
		if (timing && timing.transferSize === 0 && timing.encodedBodySize === 0 && image.sameOrigin === false && !cached) content.push(create("p", "iis-note", t("imageInfoSandbox_timing_hidden")));
		return section(t("imageInfoSandbox_section_loading"), ...content);
	}

	// The headers of an image; of a permanent record (record) without the status of the listed page — it is from another time.
	/** @type {Classes.ExtensionImageInfoSandbox['_headersSection']} */
	_headersSection(image, record = false) {
		const title = t("imageInfoSandbox_section_headers");
		const status = !record && this._result && this._result.page ? this._result.page.status : null;
		if (!image.network) {
			const why =
				image.scheme === "data" || image.scheme === "blob"
					? t("imageInfoSandbox_headers_none_local")
					: status && status.headers !== "on"
						? t("imageInfoSandbox_headers_none_off")
						: notLoaded(image)
							? t(image.usages.some((usage) => usage.loading === "lazy") ? "imageInfoSandbox_not_loaded_lazy" : "imageInfoSandbox_not_loaded")
							: t("imageInfoSandbox_headers_none");
			return section(title, create("p", "iis-note", why));
		}
		const headers = image.network.headers;
		/** @type {Node[]} */
		const content = image.network.downloaded ? [create("p", "iis-note", t("imageInfoSandbox_headers_downloaded"))] : [];
		if (headers.length === 0) return section(title, ...content, create("p", "iis-note", t("imageInfoSandbox_headers_empty")));
		const sorted = [...headers.filter(([name]) => isImageHeader(name)), ...headers.filter(([name]) => !isImageHeader(name))];
		return section(`${title} (${formatCount(headers.length)})`, ...content, entriesTable(sorted, isImageHeader));
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_metadataSection']} */
	_metadataSection(image) {
		const title = t("imageInfoSandbox_section_metadata");
		const file = image.file;
		if (notLoaded(image) && (!file || (file.source === null && file.error === "notCached"))) return section(title, create("p", "iis-note", t("imageInfoSandbox_metadata_not_loaded")));
		if (!file) return section(title, create("p", "iis-note", t("imageInfoSandbox_metadata_none")));
		if (file.source === null && file.error === "notCached" && noStore(image)) return section(title, create("p", "iis-note", t("imageInfoSandbox_metadata_no_store")));
		if (file.source === null) return section(title, create("p", "iis-note", FILE_ERRORS[file.error](file.status !== undefined ? String(file.status) : file.detail ?? "")));
		const metadata = file.metadata;
		const content = [];
		const sources = {
			cache: () => t("imageInfoSandbox_metadata_source_cache", formatBytes(file.bytes)),
			data: () => t("imageInfoSandbox_metadata_source_data", formatBytes(file.bytes)),
			blob: () => t("imageInfoSandbox_metadata_source_blob", formatBytes(file.bytes)),
			capture: () => t("imageInfoSandbox_metadata_source_capture", formatBytes(file.bytes)),
			download: () => t("imageInfoSandbox_metadata_source_download", formatBytes(file.bytes)),
		};
		content.push(create("p", "iis-note", `${sources[file.source]()}${file.complete ? "" : ` ${t("imageInfoSandbox_metadata_partial")}`}`));
		const mismatch = typeMismatch(image);
		if (mismatch) content.push(create("p", "iis-warning", t("imageInfoSandbox_metadata_mismatch", mismatch.declared, mismatch.actual)));

		const summary = metadata.summary;
		/** @type {Node | null} */
		let gps = null;
		if (summary.gps) {
			const position = create("span");
			position.append(`${summary.gps.latitude}, ${summary.gps.longitude}`, summary.gps.altitude !== null ? ` · ${summary.gps.altitude} m` : "", " · ");
			position.appendChild(createUrlNode(mapUrl(summary.gps), t("imageInfoSandbox_summary_map")));
			gps = position;
		}
		content.push(
			definitions([
				[t("imageInfoSandbox_summary_format"), metadata.format ? `${metadata.format}${metadata.mime ? ` (${metadata.mime})` : ""}` : null],
				[t("imageInfoSandbox_summary_dimensions"), metadata.width && metadata.height ? `${size(metadata.width, metadata.height)} px` : null],
				[t("imageInfoSandbox_summary_frames"), metadata.animated && metadata.frames ? formatCount(metadata.frames) : null],
				[t("imageInfoSandbox_summary_color"), [summary.colorType, summary.bitDepth ? t("imageInfoSandbox_summary_bits", summary.bitDepth) : null].filter(Boolean).join(", ") || null],
				[t("imageInfoSandbox_summary_quality"), summary.quality !== null ? `≈ ${summary.quality}` : null],
				[t("imageInfoSandbox_summary_profile"), summary.colorProfile],
				[t("imageInfoSandbox_summary_camera"), summary.camera],
				[t("imageInfoSandbox_summary_lens"), summary.lens],
				[t("imageInfoSandbox_summary_taken"), summary.taken],
				[t("imageInfoSandbox_summary_orientation"), summary.orientation],
				[t("imageInfoSandbox_summary_gps"), gps],
				[t("imageInfoSandbox_summary_place"), summary.place],
				[t("imageInfoSandbox_summary_author"), summary.author],
				[t("imageInfoSandbox_summary_copyright"), summary.copyright],
				[t("imageInfoSandbox_summary_title"), summary.title],
				[t("imageInfoSandbox_summary_description"), summary.description],
				[t("imageInfoSandbox_summary_software"), summary.software],
			])
		);
		if (metadata.warnings.length) {
			const warnings = metadata.warnings.map((warning) => {
				const colon = warning.indexOf(":");
				const code = colon < 0 ? warning : warning.slice(0, colon);
				const detail = colon < 0 ? "" : warning.slice(colon + 1);
				if (code === "truncated") return t("imageInfoSandbox_warning_truncated", detail);
				if (code === "corrupt") return t("imageInfoSandbox_warning_corrupt", detail);
				if (code === "incomplete") return t("imageInfoSandbox_warning_incomplete");
				if (code === "limit") return t("imageInfoSandbox_warning_limit");
				if (code === "unknownFormat") return t("imageInfoSandbox_warning_unknown_format");
				return warning;
			});
			content.push(create("p", "iis-warning", [...new Set(warnings)].join(" ")));
		}
		for (const group of metadata.groups) {
			const groupDetails = document.createElement("details");
			groupDetails.className = "iis-group";
			// Expanded groups stay expanded after another listing.
			const key = groupKey(image.key, group.id);
			groupDetails.open = this._openGroups.has(key);
			groupDetails.addEventListener("toggle", () => {
				if (groupDetails.open) this._openGroups.add(key);
				else this._openGroups.delete(key);
			});
			const name = GROUP_NAMES[group.id] ?? (GROUP_TEXTS[group.id] ? GROUP_TEXTS[group.id]() : group.id);
			groupDetails.appendChild(create("summary", "iis-group__summary", `${name} (${formatCount(group.entries.length)})`));
			groupDetails.appendChild(entriesTable(group.entries));
			content.push(groupDetails);
		}
		return section(title, ...content);
	}

	// --- The permanent records of images ---

	// Loads the newest permanent records (api.data.listLatest(), at most MAX_PERMANENT_RECORDS), how many there are and the
	// images whose record the user removed (DISMISSED_STATE_KEY), and draws them; the list of the page again when the recorded
	// images changed (the badge 📌, the button), and the matches of the serial numbers of the page again (the records of the
	// serial numbers are read anew). One load at a time — a change during it loads once more right after it.
	/** @type {Classes.ExtensionImageInfoSandbox['_loadRecords']} */
	_loadRecords() {
		if (this._recordsLoad) {
			this._recordsAgain = true;
			return this._recordsLoad;
		}
		this._recordsLoad = (async () => {
			do {
				this._recordsAgain = false;
				this._serialRecords.clear();
				try {
					const [entries, count, dismissed] = await Promise.all([
						this.api.data.listLatest(MAX_PERMANENT_RECORDS),
						this.api.data.count(),
						this.api.state.get(DISMISSED_STATE_KEY, /** @type {unknown} */ ([])),
					]);
					/** @type {Types.ImageInfoSandbox.RecordEntry[]} */
					const records = [];
					for (const entry of entries) {
						const read = readRecordEntry(entry);
						if (read) records.push(read);
					}
					this._records = records;
					this._recordCount = Math.max(Number(count) || 0, records.length);
					this._dismissed = dismissedKeys(dismissed);
					// The newest record of an image wins (the records come newest first).
					this._recorded = new Map([...records].reverse().map((entry) => [entry.record.image.key, entry]));
					this._recordsReady = true;
					if (!this.isConnected) return;
					this._renderRecords();
					if (recordedSignature(this._recorded) !== this._listRecorded) this._renderList();
					this._findMatches(this._result ? this._result.page : null);
				} catch (err) {
					console.warn("imageInfoSandbox: trvalé záznamy nejde načíst", err);
				}
			} while (this._recordsAgain);
		})().finally(() => {
			this._recordsLoad = null;
			if (this._recordsAgain) void this._loadRecords();
		});
		return this._recordsLoad;
	}

	// The records changed here: the other surfaces learn of it (RECORDS_STATE_KEY — the change of the value is the signal),
	// this listing loads them again.
	/** @type {Classes.ExtensionImageInfoSandbox['_recordsChanged']} */
	async _recordsChanged() {
		try {
			await this.api.state.set(RECORDS_STATE_KEY, Date.now());
		} catch (err) {
			console.warn("imageInfoSandbox: změnu trvalých záznamů nejde oznámit", err);
		}
		await this._loadRecords();
	}

	// Records the images permanently, one request after another (the button and automatic recording share the order, so one
	// image never gets two records): an image the listing knows as recorded, or one the core already has a record of (another
	// surface, an older record than the listing shows — under the key of the image, or among the records of its serial number),
	// gets no new one. A new record goes into the shared IndexedDB of the core (api.data.log() under permanentRecordKey() — the
	// key of its serial number of the camera, without one of the lens, merged with the other records of the camera or the lens,
	// otherwise the key of the image); then
	// every listing loads its records again.
	/** @type {Classes.ExtensionImageInfoSandbox['_record']} */
	_record(requests, page) {
		const run = this._recording.then(() => this._recordNow(requests, page));
		this._recording = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	/** @type {Classes.ExtensionImageInfoSandbox['_recordNow']} */
	async _recordNow(requests, page) {
		/** @type {Types.ImageInfoSandbox.RecordOutcome[]} */
		const outcomes = [];
		let written = false;
		for (const { image, auto } of requests) {
			const key = image.key;
			const known = this._recorded.get(key);
			if (known) {
				outcomes.push({ status: "exists", entry: known });
				continue;
			}
			try {
				const recordKey = permanentRecordKey(image);
				/** @type {Types.ImageInfoSandbox.RecordEntry | null} */
				let found = null;
				// Under the key of the image: a record without a serial number, or one of version 1.
				for (const entry of await this.api.data.findByKey({ key, limit: 1 })) found ??= readRecordEntry(entry);
				const group = imageGroupSerial(image);
				if (!found && group) found = (await this._recordsOfSerial(group.serial)).find((entry) => entry.record.image.key === key) ?? null;
				if (found) {
					this._recorded.set(key, found);
					outcomes.push({ status: "exists", entry: found });
					continue;
				}
				const record = permanentRecord(image, page, this._limits, auto);
				const response = await this.api.data.log(record, { key: recordKey });
				const id = response && typeof response.id === "number" ? response.id : null;
				if (id === null) throw new Error(t("imageInfoSandbox_record_not_stored"));
				/** @type {Types.ImageInfoSandbox.RecordEntry} */
				const entry = { id, record };
				this._recorded.set(key, entry);
				written = true;
				outcomes.push({ status: "recorded", entry });
			} catch (err) {
				outcomes.push({ status: "failed", error: errorText(err) });
			}
		}
		if (written) await this._recordsChanged();
		// Only older records found (no new one — the records the listing shows stay the same): the list of the page still shows them.
		else if (this.isConnected && recordedSignature(this._recorded) !== this._listRecorded) this._renderList();
		return outcomes;
	}

	// Automatic recording (the column "Record permanently" of the notices): the images of the listed page with such a property
	// that have no record yet (recordCandidates()) — not those whose record the user removed, and each at most once for this
	// listing. A failure is a line of the status until a record goes through.
	/** @type {Classes.ExtensionImageInfoSandbox['_autoRecord']} */
	_autoRecord(page) {
		if (!page || !this._recordsReady || !this.isActivationSatisfied() || !NOTICE_TAGS.some((tag) => this._notices[tag].record)) return;
		const skip = new Set([...this._recorded.keys(), ...this._dismissed, ...this._recordTried, ...this._recordingKeys]);
		const requests = recordCandidates(page, this._notices, skip, this._limits);
		if (requests.length === 0) return;
		for (const { image } of requests) this._recordTried.add(image.key);
		void this._record(requests, page).then((outcomes) => {
			const failed = outcomes.find((outcome) => outcome.status === "failed");
			const problem = failed && failed.status === "failed" ? t("imageInfoSandbox_record_auto_failed", failed.error) : outcomes.some((outcome) => outcome.status === "recorded") ? null : this._recordProblem;
			if (problem === this._recordProblem || !this.isConnected) return;
			this._recordProblem = problem;
			this._render();
		});
	}

	// The button "Record permanently" of an image (before "Save" / "Download"); a recorded image has it disabled — "Recorded
	// permanently", the title says when.
	/** @type {Classes.ExtensionImageInfoSandbox['_recordButton']} */
	_recordButton(image, note) {
		const button = create("button", "iis-fetch__button iis-fetch__record");
		button.type = "button";
		const entry = this._recorded.get(image.key);
		const busy = !entry && this._recordingKeys.has(image.key);
		button.textContent = t(entry ? "imageInfoSandbox_record_done_button" : busy ? "imageInfoSandbox_record_busy" : "imageInfoSandbox_record_button");
		button.title = entry ? t("imageInfoSandbox_record_done_title", formatTime(entry.record.recordedAt)) : t("imageInfoSandbox_record_title");
		button.disabled = busy || !!entry;
		button.addEventListener("click", () => void this._recordImage(image, button, note));
		return button;
	}

	// Records the image permanently by the button — also one whose record the user removed before (automatic recording then
	// may record it again). The note says how it ended; a new record draws the list again (the button and the badge show it) —
	// the note then goes to the new line of the image and stays there while the image is recorded (_recordNotes).
	/** @type {Classes.ExtensionImageInfoSandbox['_recordImage']} */
	async _recordImage(image, button, note) {
		if (this._recordingKeys.has(image.key) || this._recorded.has(image.key)) return;
		const page = this._result ? this._result.page : null;
		this._recordingKeys.add(image.key);
		button.disabled = true;
		button.textContent = t("imageInfoSandbox_record_busy");
		note.classList.remove("iis-fetch__note--error");
		/** @type {Types.ImageInfoSandbox.RecordOutcome} */
		let outcome;
		try {
			if (this._dismissed.has(image.key)) {
				this._dismissed.delete(image.key);
				await this.api.state.set(DISMISSED_STATE_KEY, dismissRecord(await this.api.state.get(DISMISSED_STATE_KEY, /** @type {unknown} */ ([])), image.key, false));
			}
			[outcome] = await this._record([{ image, auto: null }], page);
		} catch (err) {
			outcome = { status: "failed", error: errorText(err) };
		}
		this._recordingKeys.delete(image.key);
		if (outcome.status === "failed") {
			note.textContent = t("imageInfoSandbox_record_failed", outcome.error);
			note.classList.add("iis-fetch__note--error");
			button.disabled = false;
			button.textContent = t("imageInfoSandbox_record_button");
			return;
		}
		const text = outcome.status === "recorded" ? t("imageInfoSandbox_record_done") : t("imageInfoSandbox_record_exists", formatTime(outcome.entry.record.recordedAt));
		this._recordNotes.set(image.key, text);
		const shown = note.isConnected ? note : this._items.get(image.key)?.querySelector(".iis-fetch__note");
		if (shown) {
			shown.textContent = text;
			shown.classList.remove("iis-fetch__note--error");
		}
		button.textContent = t("imageInfoSandbox_record_done_button");
		button.title = t("imageInfoSandbox_record_done_title", formatTime(outcome.entry.record.recordedAt));
	}

	// The section "Permanently recorded images (N)": shown while the module is active and there is a record; while it is
	// expanded the newest records (newest first), each like an image of the page, the records of one serial number merged into
	// its group (groupRecords() of format.mjs) — built again only when they, the notices or their limits changed.
	/** @type {Classes.ExtensionImageInfoSandbox['_renderRecords']} */
	_renderRecords() {
		const hidden = !this.isActivationSatisfied() || this._recordCount === 0;
		this._recordsEl.hidden = hidden;
		this._recordsTitleEl.textContent = t("imageInfoSandbox_records_title", formatCount(this._recordCount));
		const open = !hidden && this._recordsEl.open;
		const shown = open ? JSON.stringify([this._records.map((entry) => entry.id), this._recordCount, this._notices, this._limits]) : null;
		if (shown === this._recordsShown) return;
		this._recordsShown = shown;
		this._recordsListEl.textContent = "";
		if (!open) return;
		for (const group of groupRecords(this._records)) {
			this._recordsListEl.appendChild(group.serial === null ? this._createRecordItem(group.entries[0]) : this._createRecordGroup(group.serial, group.entries));
		}
		if (this._recordCount > this._records.length) {
			this._recordsListEl.appendChild(create("li", "iis-list__empty", t("imageInfoSandbox_records_more", formatCount(this._records.length), formatCount(this._recordCount))));
		}
	}

	// The records of one serial number (a group of the section): its line — the serial number with its kind (of the camera, of the
	// lens), how many images, the time of the newest record and the places of the records — and its records, built when it is
	// expanded (it stays expanded after the records are drawn again).
	/** @type {Classes.ExtensionImageInfoSandbox['_createRecordGroup']} */
	_createRecordGroup(serial, entries) {
		const item = create("li", "iis-item iis-record-group");
		const details = document.createElement("details");
		details.className = "iis-item__details";
		const summary = document.createElement("summary");
		summary.className = "iis-item__summary";
		summary.title = t(serial.kind === "lens" ? "imageInfoSandbox_records_group_lens_title" : "imageInfoSandbox_records_group_title");
		const places = [...new Set(entries.map((entry) => recordSite(entry.record.page)).filter(Boolean))];
		summary.append(
			create("span", "iis-item__name", serialLabel(serial)),
			create("span", "iis-item__facts", tp("imageInfoSandbox_count", entries.length, formatCount(entries.length))),
			create("span", "iis-record__when", [formatTime(entries[0].record.recordedAt), places.join(", ")].filter(Boolean).join(" · "))
		);
		const list = create("ol", "iis-record-group__list");
		details.append(summary, list);
		const fill = () => {
			if (!details.open || details.dataset.filled) return;
			details.dataset.filled = "1";
			for (const entry of entries) list.appendChild(this._createRecordItem(entry));
		};
		const key = serialRefKey(serial);
		details.addEventListener("toggle", () => {
			if (!details.isConnected) return;
			if (details.open) this._openSerials.add(key);
			else this._openSerials.delete(key);
			fill();
		});
		if (this._openSerials.has(key)) {
			details.open = true;
			fill();
		}
		item.appendChild(details);
		return item;
	}

	// The properties of an image of a record need the page it was recorded on (https) and the limits of the settings now.
	/** @type {Classes.ExtensionImageInfoSandbox['_recordContext']} */
	_recordContext(record) {
		return { ...this._limits, pageSecure: record.pageSecure };
	}

	// One permanent record: its line (the name, the facts, the badges by the settings now, the time and the page) and the details
	// built when it is expanded. A record the listing cannot show (another version) has only its line and the button to remove it.
	/** @type {Classes.ExtensionImageInfoSandbox['_createRecordItem']} */
	_createRecordItem(entry) {
		const { record } = entry;
		const image = record.image;
		const item = create("li", "iis-item iis-record");
		const details = document.createElement("details");
		details.className = "iis-item__details";
		const summary = document.createElement("summary");
		summary.className = "iis-item__summary";
		summary.title = image.url;
		summary.append(create("span", "iis-item__name", fileName(image.url)));
		try {
			summary.append(create("span", "iis-item__facts", facts(image)), chipsElement(chips(image, this._notices, this._recordContext(record))));
		} catch (err) {
			console.warn("imageInfoSandbox: trvalý záznam nejde ukázat", err);
		}
		summary.appendChild(create("span", "iis-record__when", [formatTime(record.recordedAt), recordPageLabel(record.page)].filter(Boolean).join(" · ")));
		details.appendChild(summary);
		const fill = () => {
			if (!details.open || details.dataset.filled) return;
			details.dataset.filled = "1";
			details.appendChild(this._createRecordBody(entry));
		};
		details.addEventListener("toggle", () => {
			if (!details.isConnected) return;
			if (details.open) this._openRecords.add(entry.id);
			else this._openRecords.delete(entry.id);
			fill();
		});
		if (this._openRecords.has(entry.id)) {
			details.open = true;
			fill();
		}
		item.appendChild(details);
		return item;
	}

	// The details of a permanent record: the button "Remove the record", when and where the image was recorded and why, then
	// the same sections as an image of the page (without the thumbnail — the record has no file).
	/** @type {Classes.ExtensionImageInfoSandbox['_createRecordBody']} */
	_createRecordBody(entry) {
		const { record } = entry;
		const body = create("div", "iis-item__body");
		const box = create("div", "iis-fetch");
		const note = create("span", "iis-fetch__note");
		const remove = create("button", "iis-fetch__button iis-record__remove", t("imageInfoSandbox_record_remove"));
		remove.type = "button";
		remove.title = t("imageInfoSandbox_record_remove_title");
		remove.disabled = this._removingRecords.has(entry.id);
		if (remove.disabled) remove.textContent = t("imageInfoSandbox_record_remove_busy");
		remove.addEventListener("click", () => void this._removeRecord(entry, remove, note));
		box.append(remove, note);
		body.appendChild(box);
		try {
			// The groups of its metadata expand on their own, not together with the same image of the page (groupKey()).
			const image = { ...record.image, key: `record ${entry.id}` };
			body.append(this._recordSection(record), this._addressSection(image), this._usagesSection(image), this._loadingSection(image), this._headersSection(image, true), this._metadataSection(image));
		} catch (err) {
			console.warn("imageInfoSandbox: trvalý záznam nejde ukázat", err);
			body.appendChild(create("p", "iis-warning", t("imageInfoSandbox_record_broken")));
		}
		return body;
	}

	// When and where the image was recorded and how (the button, or automatically for which properties), and its properties then
	// with their values (a property that has none — only its name).
	/** @type {Classes.ExtensionImageInfoSandbox['_recordSection']} */
	_recordSection(record) {
		const context = this._recordContext(record);
		const { url, title } = record.page;
		const page = url ? createUrlNode(url, title && title.trim() ? `${title.trim()} — ${url}` : url) : title;
		const properties = record.tags.map((tag) => {
			const detail = EXPLAINED_ONLY.has(tag) ? null : NOTICE_DETAILS[tag](record.image, context);
			return detail ? `${noticeTagText(tag)}: ${detail}` : noticeTagText(tag);
		});
		return section(
			t("imageInfoSandbox_section_record"),
			definitions([
				[t("imageInfoSandbox_record_when"), formatTime(record.recordedAt)],
				[t("imageInfoSandbox_record_page"), page],
				[t("imageInfoSandbox_record_how"), record.auto ? t("imageInfoSandbox_record_how_auto", record.auto.map(noticeTagText).join(", ")) : t("imageInfoSandbox_record_how_button")],
				[t("imageInfoSandbox_record_properties"), properties.join("\n")],
			])
		);
	}

	// Removes a permanent record (api.data.remove()); automatic recording then never records the image again (DISMISSED_STATE_KEY
	// — the button can). The records are loaded again in every listing; a failure goes into the note.
	/** @type {Classes.ExtensionImageInfoSandbox['_removeRecord']} */
	async _removeRecord(entry, button, note) {
		if (this._removingRecords.has(entry.id)) return;
		this._removingRecords.add(entry.id);
		button.disabled = true;
		button.textContent = t("imageInfoSandbox_record_remove_busy");
		note.classList.remove("iis-fetch__note--error");
		const key = entry.record.image.key;
		let removed = false;
		/** @type {string | null} */
		let problem = null;
		try {
			removed = await this.api.data.remove(entry.id);
			if (removed) {
				this._dismissed.add(key);
				await this.api.state.set(DISMISSED_STATE_KEY, dismissRecord(await this.api.state.get(DISMISSED_STATE_KEY, /** @type {unknown} */ ([])), key, true));
			}
		} catch (err) {
			problem = errorText(err);
		}
		this._removingRecords.delete(entry.id);
		if (removed) {
			this._openRecords.delete(entry.id);
			this._recordNotes.delete(key);
			await this._recordsChanged();
			return;
		}
		note.textContent = t("imageInfoSandbox_record_remove_failed", problem ?? t("imageInfoSandbox_record_not_found"));
		note.classList.add("iis-fetch__note--error");
		button.disabled = false;
		button.textContent = t("imageInfoSandbox_record_remove");
	}
}

customElements.define(TAG, ExtensionImageInfoSandbox);

registerModule({
	name: MODULE_NAME,
	tag: TAG,
	description: DESCRIPTION,
	activationSpec: ACTIVATION_SPEC,
	defaultActivationMode: DEFAULT_ACTIVATION_MODE,
	defaultDisplayLocation: DEFAULT_DISPLAY_LOCATION,
	defaultOutputElement: DEFAULT_OUTPUT_ELEMENT,
	defaultShowHeading: DEFAULT_SHOW_HEADING,
	styles: STYLES,
	settingsSchema: SETTINGS_SCHEMA,
	dependsOn: DEPENDS_ON,
	capabilities: CAPABILITIES,
});
