//@ts-check
"use strict";

// sandbox-modules/imageInfoSandbox/format.mjs
// The values of the listing of the images as text, sorting and searching — without DOM (the tests use the functions
// directly). An image has its data from several places (Types.ImageInfo.ImageEntry): where the page uses it, Resource
// Timing, the recorded response and the metadata of its file — the functions here pick the best one there is.
import { getUiLocale } from "../../sdk.mjs";
import { NOTICE_TAGS, TRACKING_PIXEL_SIZE, RECORD_LIMITS, RECORD_VERSION, MAX_DISMISSED_RECORDS, SERIAL_KEY_PREFIX, SERIAL_KINDS } from "./module.mjs";

// The response headers that concern the image itself (its type, size, date, caching, who may use it), and the names
// that point at an image (servers and CDNs send their own: Image-Width, X-Image-Height, Camera-Model, X-Imgix-*, …).
const IMAGE_HEADERS = new Set([
	"content-type",
	"content-length",
	"content-encoding",
	"content-disposition",
	"content-range",
	"content-dpr",
	"content-location",
	"last-modified",
	"etag",
	"cache-control",
	"expires",
	"age",
	"date",
	"vary",
	"accept-ranges",
	"link",
	"timing-allow-origin",
	"access-control-allow-origin",
	"cross-origin-resource-policy",
	"x-content-type-options",
	"server",
]);
const IMAGE_HEADER_PATTERN = /image|img|width|height|camera|exif|photo|dpr|pixel|resolution|thumbnail|format|quality|imgix|cloudinary|akamai|x-cache|cf-polished|cf-bgj/i;

/** @type {Functions.ImageInfoSandbox.Format.isImageHeader} */
export function isImageHeader(name) {
	const lower = name.toLowerCase();
	return IMAGE_HEADERS.has(lower) || IMAGE_HEADER_PATTERN.test(lower);
}

// The value of a response header (the first one with the name), or null.
/** @type {Functions.ImageInfoSandbox.Format.headerValue} */
export function headerValue(headers, name) {
	const lower = name.toLowerCase();
	const found = headers.find(([header]) => header.toLowerCase() === lower);
	return found ? found[1] : null;
}

// A size in bytes as text in the language of the interface ("245 kB", "1.4 MB").
/** @type {Functions.ImageInfoSandbox.Format.formatBytes} */
export function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes < 0) return "";
	const units = ["B", "kB", "MB", "GB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${new Intl.NumberFormat(getUiLocale(), { maximumFractionDigits: unit === 0 ? 0 : value < 10 ? 2 : 1 }).format(value)} ${units[unit]}`;
}

// A number in the language of the interface.
/** @type {Functions.ImageInfoSandbox.Format.formatCount} */
export function formatCount(value) {
	return new Intl.NumberFormat(getUiLocale()).format(value);
}

// A time of the day (today) or a date with the time.
/** @type {Functions.ImageInfoSandbox.Format.formatTime} */
export function formatTime(ms) {
	const date = new Date(ms);
	const today = date.toDateString() === new Date().toDateString();
	return today ? date.toLocaleTimeString(getUiLocale()) : date.toLocaleString(getUiLocale());
}

// The name of the file from the address: the last part of the path (decoded), otherwise the host; a data: address by
// its type.
/** @type {Functions.ImageInfoSandbox.Format.fileName} */
export function fileName(url) {
	if (url.startsWith("data:")) return url.slice(0, Math.max(url.indexOf(";"), url.indexOf(","), 10)).replace(/[;,…].*$/, "");
	if (url.startsWith("blob:")) return "blob";
	try {
		const parsed = new URL(url);
		const last = parsed.pathname.split("/").filter(Boolean).pop();
		if (!last) return parsed.host;
		try {
			return decodeURIComponent(last);
		} catch {
			return last;
		}
	} catch {
		return url;
	}
}

// The metadata of the image, when its file could be read.
/** @type {Functions.ImageInfoSandbox.Format.metadataOf} */
export function metadataOf(image) {
	return image.file && image.file.source !== null ? image.file.metadata : null;
}

// The size of the file: from Resource Timing (the encoded body), from Content-Length, from the read file (a whole one).
/** @type {Functions.ImageInfoSandbox.Format.imageBytes} */
export function imageBytes(image) {
	if (image.timing && image.timing.encodedBodySize > 0) return image.timing.encodedBodySize;
	const length = image.network ? Number(headerValue(image.network.headers, "content-length")) : NaN;
	if (Number.isFinite(length) && length > 0) return length;
	if (image.file && image.file.source !== null && image.file.complete) return image.file.bytes;
	return null;
}

// The format: by the file (its signature), otherwise by Content-Type, otherwise by the extension of the address.
/** @type {Functions.ImageInfoSandbox.Format.imageFormat} */
export function imageFormat(image) {
	const metadata = metadataOf(image);
	if (metadata && metadata.format) return metadata.format;
	const type = (image.network && headerValue(image.network.headers, "content-type")) || (image.timing && image.timing.contentType) || "";
	const subtype = /^image\/(?:x-)?([a-z0-9.+-]+)/i.exec(type.trim());
	if (subtype) return subtype[1].replace(/\+xml$/, "").toUpperCase();
	const data = /^data:image\/(?:x-)?([a-z0-9.+-]+)/i.exec(image.url);
	if (data) return data[1].replace(/\+xml$/, "").toUpperCase();
	const extension = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(image.url);
	return extension ? extension[1].toUpperCase() : null;
}

// The size of the image in pixels: from the file, otherwise the natural size of an <img>.
/** @type {Functions.ImageInfoSandbox.Format.imageDimensions} */
export function imageDimensions(image) {
	const metadata = metadataOf(image);
	if (metadata && metadata.width && metadata.height) return [metadata.width, metadata.height];
	const usage = image.usages.find((item) => item.naturalWidth && item.naturalHeight);
	return usage ? [/** @type {number} */ (usage.naturalWidth), /** @type {number} */ (usage.naturalHeight)] : null;
}

// Content-Type says another format than the file is (a PNG sent as image/jpeg) — the declared and the real type.
/** @type {Functions.ImageInfoSandbox.Format.typeMismatch} */
export function typeMismatch(image) {
	const metadata = metadataOf(image);
	const declared = image.network ? headerValue(image.network.headers, "content-type") : null;
	if (!metadata || !metadata.mime || !declared) return null;
	const normalize = (/** @type {string} */ value) =>
		value
			.split(";")[0]
			.trim()
			.toLowerCase()
			.replace("image/jpg", "image/jpeg")
			.replace("image/pjpeg", "image/jpeg")
			.replace("image/vnd.microsoft.icon", "image/x-icon")
			.replace("image/apng", "image/png");
	if (normalize(declared) === normalize(metadata.mime) || normalize(declared) === "application/octet-stream") return null;
	return { declared: declared.split(";")[0].trim(), actual: metadata.mime };
}

// Did the response come from the cache (the record says so, or Resource Timing transferred nothing of a body)?
/** @type {Functions.ImageInfoSandbox.Format.fromCache} */
export function fromCache(image) {
	if (image.network) return image.network.fromCache;
	if (!image.timing) return null;
	if (image.timing.deliveryType === "cache") return true;
	return image.timing.transferSize === 0 && image.timing.decodedBodySize > 0 ? true : null;
}

// Did the image fail to load (an error of the request, an error status)?
/** @type {Functions.ImageInfoSandbox.Format.loadFailed} */
export function loadFailed(image) {
	if (image.network && (image.network.error || (image.network.statusCode !== null && image.network.statusCode >= 400))) return true;
	return !!(image.timing && image.timing.responseStatus !== null && image.timing.responseStatus >= 400);
}

// Is the page in the tab an image alone — an image opened in the tab, not an HTML page? By the type of the document of the
// main frame; without the frames (no page access) by the record of the tab's own address as a document.
/** @type {Functions.ImageInfoSandbox.Format.isImagePage} */
export function isImagePage(page) {
	const top = page.frames.find((frame) => frame.frameId === 0);
	if (top) return !!top.contentType && top.contentType.trim().toLowerCase().startsWith("image/");
	const url = page.tab ? page.tab.url : null;
	return !!url && page.images.some((image) => image.url === url && image.network !== null && image.network.type === "main_frame");
}

// Has the page not loaded the image (yet)? No request, no Resource Timing, no file — and every element of it says so: an
// <img> that is not complete (a lazy one outside the view, one still loading), another element that is not displayed.
/** @type {Functions.ImageInfoSandbox.Format.notLoaded} */
export function notLoaded(image) {
	if (image.network || image.timing || (image.file && image.file.source !== null) || image.usages.length === 0) return false;
	return image.usages.every((usage) => (usage.complete !== undefined ? !usage.complete : usage.renderedWidth === 0 || usage.renderedHeight === 0));
}

// Did the button "Remove from the document" remove the image from the page? The page uses it nowhere any more, the listing
// has the places it was removed from (the usages marked removed).
/** @type {Functions.ImageInfoSandbox.Format.isRemoved} */
export function isRemoved(image) {
	return image.usageCount === 0 && image.usages.some((usage) => usage.removed === true);
}

// Does the page show the image somewhere without a text description — an <img> or an <input type="image"> without alt (the
// <input> without a non-empty one), aria-labelledby, aria-label, the <figcaption> of its <figure> and title (textLabel() of
// collectFrame.mjs)? A removed usage does not count, nor the usages without alt (CSS, SVG, a poster, an icon, a preload).
/** @type {Functions.ImageInfoSandbox.Format.missingLabel} */
export function missingLabel(image) {
	return image.usages.some((usage) => usage.label === null && !usage.removed);
}

// The kind of a serial number by the name of its entry of the metadata (…SerialNumber): of the lens (EXIF LensSerialNumber,
// XMP aux:LensSerialNumber, exifEX:LensSerialNumber), otherwise of the camera (EXIF SerialNumber, XMP aux:SerialNumber,
// exifEX:BodySerialNumber, InternalSerialNumber, …); null = not a serial number.
/** @type {Functions.ImageInfoSandbox.Format.serialKind} */
export function serialKind(name) {
	if (!/serialnumber$/i.test(name)) return null;
	return /lensserialnumber$/i.test(name) ? "lens" : "camera";
}

// A serial number of the camera or of the lens (kind) in the metadata — the first one, null = none.
/** @type {Functions.ImageInfoSandbox.Format.serialNumber} */
export function serialNumber(image, kind) {
	const metadata = metadataOf(image);
	for (const group of metadata ? metadata.groups : []) {
		const found = group.entries.find(([name, value]) => serialKind(name) === kind && typeof value === "string" && value.trim() !== "");
		if (found) return found[1].trim();
	}
	return null;
}

// The values of a serial number that name no device ("N/A", "unknown", …) — besides those without a letter or a digit and
// those of zeros alone ("0000000000", "-").
const SERIAL_PLACEHOLDERS = new Set(["N/A", "NA", "NONE", "NULL", "UNKNOWN", "UNDEFINED", "NOT AVAILABLE"]);

// The serial numbers of the camera or of the lens (kind) of the image as identifiers — of the matches and of the groups of the
// permanent records: every value of an entry of the metadata of the kind (serialKind()) with its white space joined and in
// upper case (one camera written by two programs a little differently), without a value that names no device — each once,
// in the order of the metadata.
/** @type {Functions.ImageInfoSandbox.Format.serialIds} */
export function serialIds(image, kind) {
	const metadata = metadataOf(image);
	/** @type {Set<string>} */
	const ids = new Set();
	for (const group of metadata ? metadata.groups : []) {
		for (const [name, value] of group.entries) {
			if (serialKind(name) !== kind || typeof value !== "string") continue;
			const id = value.trim().replace(/\s+/g, " ").toUpperCase();
			if (/[\p{L}\p{N}]/u.test(id) && !/^[0\s\p{P}]*$/u.test(id) && !SERIAL_PLACEHOLDERS.has(id)) ids.add(id);
		}
	}
	return [...ids];
}

// The own key of the records of a serial number (api.data.findByKey() — all records of the camera or the lens; one prefix for
// both kinds, the records say which).
/** @type {Functions.ImageInfoSandbox.Format.serialRecordKey} */
export function serialRecordKey(serial) {
	return `${SERIAL_KEY_PREFIX}${serial}`;
}

// A serial number with its kind as one text (the keys of maps and sets — a serial number has no line break).
/** @type {Functions.ImageInfoSandbox.Format.serialRefKey} */
export function serialRefKey({ kind, serial }) {
	return `${kind}\n${serial}`;
}

// The serial number that merges the records of an image: its first serial number of the camera, without one its first serial
// number of the lens; null = none.
/** @type {Functions.ImageInfoSandbox.Format.groupSerial} */
export function groupSerial(cameraSerials, lensSerials) {
	if (cameraSerials.length > 0) return { kind: "camera", serial: cameraSerials[0] };
	if (lensSerials.length > 0) return { kind: "lens", serial: lensSerials[0] };
	return null;
}

// The serial number of the image its permanent record is stored under (groupSerial()), null = none.
/** @type {Functions.ImageInfoSandbox.Format.imageGroupSerial} */
export function imageGroupSerial(image) {
	return groupSerial(serialIds(image, "camera"), serialIds(image, "lens"));
}

// The own key of the permanent record of an image (api.data.log()): the key of its serial number (imageGroupSerial() — the
// records of one camera, or of one lens of the photos without a serial number of the camera, merged under one key), without
// one the key of the image.
/** @type {Functions.ImageInfoSandbox.Format.permanentRecordKey} */
export function permanentRecordKey(image) {
	const group = imageGroupSerial(image);
	return group ? serialRecordKey(group.serial) : image.key;
}

// The serial numbers of a kind of a permanent record.
/** @type {Functions.ImageInfoSandbox.Format.recordSerials} */
export function recordSerials(record, kind) {
	return kind === "lens" ? record.lensSerials : record.cameraSerials;
}

// Does the file carry an embedded thumbnail (EXIF IFD1, JFXX, Photoshop)? It may show the original before a crop or an edit.
/** @type {Functions.ImageInfoSandbox.Format.hasEmbeddedThumbnail} */
export function hasEmbeddedThumbnail(image) {
	const metadata = metadataOf(image);
	if (!metadata) return false;
	return metadata.groups.some(
		(group) => group.id === "thumbnail" || group.entries.some(([name]) => name === "JFXXThumbnail" || name === "PhotoshopThumbnail")
	);
}

// Does the page show the image in an <img> without the width or the height attribute (the page moves once it loads)? A
// removed usage does not count.
/** @type {Functions.ImageInfoSandbox.Format.missingDimensions} */
export function missingDimensions(image) {
	return image.usages.some((usage) => usage.kind === "img" && !usage.removed && (!usage.width || !usage.height));
}

// Is the image an http one on an https page (mixed content) — a usage in a frame with an https address, or without the
// usages the page of the tab?
/** @type {Functions.ImageInfoSandbox.Format.isMixedContent} */
export function isMixedContent(image, context) {
	if (image.scheme !== "http") return false;
	if (image.usages.length === 0) return context.pageSecure;
	return image.usages.some((usage) => /^https:/i.test(usage.frameUrl ?? ""));
}

// Is the image a tracking pixel — of another origin and at most TRACKING_PIXEL_SIZE × TRACKING_PIXEL_SIZE px (its pixels,
// otherwise the estimate by its usages)?
/** @type {Functions.ImageInfoSandbox.Format.isTrackingPixel} */
export function isTrackingPixel(image) {
	if (image.sameOrigin !== false) return false;
	const dimensions = imageDimensions(image) ?? estimatedDimensions(image);
	return dimensions !== null && dimensions[0] <= TRACKING_PIXEL_SIZE && dimensions[1] <= TRACKING_PIXEL_SIZE;
}

// Is the image oversized — its pixels more than factor times the largest size the page renders it at, in both directions?
// Its size and the largest rendered one, null = not oversized (or no usage renders it).
/** @type {Functions.ImageInfoSandbox.Format.oversizedBy} */
export function oversizedBy(image, factor) {
	const dimensions = imageDimensions(image);
	if (!dimensions) return null;
	/** @type {[number, number] | null} */
	let rendered = null;
	for (const usage of image.usages) {
		if (usage.removed || !usage.renderedWidth || !usage.renderedHeight) continue;
		rendered = rendered ? [Math.max(rendered[0], usage.renderedWidth), Math.max(rendered[1], usage.renderedHeight)] : [usage.renderedWidth, usage.renderedHeight];
	}
	if (!rendered || dimensions[0] <= rendered[0] * factor || dimensions[1] <= rendered[1] * factor) return null;
	return { file: dimensions, rendered };
}

// What the properties need from the page and the settings: is the page of the tab https (an image without a usage), the limits.
/** @type {Functions.ImageInfoSandbox.Format.noticeContext} */
export function noticeContext(page, limits) {
	const top = page ? page.frames.find((frame) => frame.frameId === 0) : undefined;
	const url = top ? top.url : page && page.tab ? page.tab.url : null;
	return { ...limits, pageSecure: !!url && /^https:/i.test(url) };
}

// The properties of the image the listing can call attention to, in the order of NOTICE_TAGS of module.mjs.
/** @type {Functions.ImageInfoSandbox.Format.noticeTags} */
export function noticeTags(image, context) {
	const metadata = metadataOf(image);
	const summary = metadata ? metadata.summary : null;
	const bytes = imageBytes(image);
	/** @type {Record<Enums.ImageInfoSandbox.NoticeTag, boolean>} */
	const has = {
		place: !!summary && !!(summary.gps || summary.place),
		camera: !!summary && !!summary.camera,
		taken: !!summary && !!summary.taken,
		serial: serialNumber(image, "camera") !== null,
		lensSerial: serialNumber(image, "lens") !== null,
		exifThumbnail: hasEmbeddedThumbnail(image),
		copyright: !!summary && !!(summary.author || summary.copyright),
		software: !!summary && !!summary.software,
		noLabel: missingLabel(image),
		noDimensions: missingDimensions(image),
		mismatch: typeMismatch(image) !== null,
		failed: loadFailed(image),
		mixedContent: isMixedContent(image, context),
		trackingPixel: isTrackingPixel(image),
		crossOrigin: image.sameOrigin === false,
		animated: !!metadata && metadata.animated === true,
		oversized: oversizedBy(image, context.oversizeFactor) !== null,
		largeFile: bytes !== null && bytes > context.largeFileBytes,
		complete: !!hasAllInfo(image),
		removed: isRemoved(image),
		notLoaded: notLoaded(image),
		unused: image.usageCount === 0 && !isRemoved(image),
		fromCache: fromCache(image) === true,
		lazy: image.usages.some((usage) => usage.loading === "lazy"),
		exif: !!metadata && metadata.groups.some((group) => group.id === "exif"),
		xmp: !!metadata && metadata.groups.some((group) => group.id === "xmp"),
		iptc: !!metadata && metadata.groups.some((group) => group.id === "iptc"),
		gps: !!summary && !!summary.gps,
	};
	return NOTICE_TAGS.filter((tag) => has[tag]);
}

// Does a notice keep the image in the listing — has it a property whose "Never hide" is on?
/** @type {Functions.ImageInfoSandbox.Format.isKept} */
export function isKept(image, notices, context) {
	return noticeTags(image, context).some((tag) => notices[tag].keep);
}

// The images to mark on the page itself: the images the page uses (not one it only loaded, not a removed one) with the
// properties whose "Show on the page" is on, or "Show on the page over larger images" for an image that is not small (the
// size of small images from Settings), in the order of the page — at most max of them.
/** @type {Functions.ImageInfoSandbox.Format.markedImages} */
export function markedImages(page, notices, limits, small, max) {
	const context = noticeContext(page, limits);
	/** @type {ReturnType<Functions.ImageInfoSandbox.Format.markedImages>} */
	const found = [];
	for (const image of page.images) {
		if (found.length >= max) break;
		if (image.usageCount === 0) continue;
		const large = !isSmallImage(image, small.width, small.height);
		const tags = noticeTags(image, context).filter((tag) => notices[tag].page || (large && notices[tag].pageLarge));
		if (tags.length > 0) found.push({ image, tags });
	}
	return found;
}

// A text of at most max characters (UTF-16 units, as the core counts them) — a longer one (the metadata, a file name) shortened
// with an ellipsis, never in the middle of a character.
/** @type {Functions.ImageInfoSandbox.Format.clipText} */
export function clipText(text, max) {
	if (text.length <= max) return text;
	let end = Math.max(0, max - 1);
	if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
	return `${text.slice(0, end)}…`;
}

// The most documents whose announced images the listing remembers, and the most of them for one document.
export const NOTICE_MAX_DOCUMENTS = 20;
export const NOTICE_MAX_KEYS = 3000;

// The document of the listing for the notifications: the tab and the time its document started (Page.documentAt), without
// it the address of the page — another document announces its images again. null = no tab.
/** @type {Functions.ImageInfoSandbox.Format.noticeDocument} */
export function noticeDocument(page) {
	if (!page || !page.tab) return null;
	return `${page.tab.tabId} ${page.documentAt ?? pageAddress(page) ?? ""}`;
}

// The keys already announced for the document ("<key of the image>\n<property>") from the remembered ones.
/** @type {Functions.ImageInfoSandbox.Format.announcedKeys} */
export function announcedKeys(announced, documentKey) {
	const entry = Array.isArray(announced) ? announced.find((item) => Array.isArray(item) && item[0] === documentKey) : undefined;
	return new Set(entry && Array.isArray(entry[1]) ? entry[1].filter((key) => typeof key === "string") : []);
}

// The remembered announced keys with the new ones of the document: the document goes last, at most NOTICE_MAX_DOCUMENTS of
// them (the oldest go) and NOTICE_MAX_KEYS of one (its oldest go).
/** @type {Functions.ImageInfoSandbox.Format.rememberNotices} */
export function rememberNotices(announced, documentKey, keys) {
	const others = (Array.isArray(announced) ? announced : []).filter(
		/** @returns {item is [string, string[]]} */ (item) => Array.isArray(item) && typeof item[0] === "string" && item[0] !== documentKey && Array.isArray(item[1])
	);
	const merged = [...new Set([...announcedKeys(announced, documentKey), ...keys])].slice(-NOTICE_MAX_KEYS);
	return [...others, /** @type {[string, string[]]} */ ([documentKey, merged])].slice(-NOTICE_MAX_DOCUMENTS);
}

// What to announce from the listing: the keys ("<key of the image>\n<property>") of the images the document uses (not one the
// page only loaded, not a removed one) with a property whose notification is on, that the document has not announced yet.
/** @type {Functions.ImageInfoSandbox.Format.newNotices} */
export function newNotices(page, notices, announced, limits) {
	const context = noticeContext(page, limits);
	return page.images.flatMap((image) =>
		image.usageCount === 0 ? [] : noticeTags(image, context).flatMap((tag) => (notices[tag].notify && !announced.has(`${image.key}\n${tag}`) ? [`${image.key}\n${tag}`] : []))
	);
}

// The keys of the images among the announced keys ("<key of the image>\n<property>"), each once, in their order — at most
// max of them, the newest.
/** @type {Functions.ImageInfoSandbox.Format.announcedImages} */
export function announcedImages(keys, max) {
	return [...new Set([...keys].map((key) => key.slice(0, key.lastIndexOf("\n"))))].slice(-max);
}

// The data of a click on a notification of the listing (the data of show() as the core gives it back — foreign, so checked):
// the tab, the document and the keys of its images; null = not a notification of the listing.
/** @type {Functions.ImageInfoSandbox.Format.readNoticeClick} */
export function readNoticeClick(click) {
	const data = click && typeof click === "object" ? /** @type {Record<string, unknown>} */ (click).data : null;
	if (!data || typeof data !== "object") return null;
	const { tabId, document: documentKey, images } = /** @type {Record<string, unknown>} */ (data);
	if (typeof tabId !== "number" || !Number.isInteger(tabId) || typeof documentKey !== "string" || !Array.isArray(images)) return null;
	const keys = images.filter((key) => typeof key === "string");
	return keys.length > 0 ? { tabId, document: documentKey, images: keys } : null;
}

// The announced keys of a document as numbers: how many images and how many of them have each property.
/** @type {Functions.ImageInfoSandbox.Format.countNotices} */
export function countNotices(keys) {
	/** @type {Set<string>} */
	const images = new Set();
	/** @type {Partial<Record<Enums.ImageInfoSandbox.NoticeTag, number>>} */
	const counts = {};
	for (const key of keys) {
		const split = key.lastIndexOf("\n");
		const tag = /** @type {Enums.ImageInfoSandbox.NoticeTag} */ (key.slice(split + 1));
		images.add(key.slice(0, split));
		counts[tag] = (counts[tag] ?? 0) + 1;
	}
	return { images: images.size, counts };
}

// Did the server forbid storing the response (Cache-Control: no-store)?
/** @type {Functions.ImageInfoSandbox.Format.noStore} */
export function noStore(image) {
	const value = image.network ? headerValue(image.network.headers, "cache-control") : null;
	return !!value && value.split(",").some((part) => part.trim().toLowerCase() === "no-store");
}

// Can the button "Load information" give the image something it lacks — the headers or the metadata of its file? Only an
// http(s) address (the background part downloads it once more).
/** @type {Functions.ImageInfoSandbox.Format.canFetch} */
export function canFetch(image) {
	return (image.scheme === "http" || image.scheme === "https") && (image.network === null || metadataOf(image) === null);
}

// Can the button "Block the image permanently" block the image? Only an http(s) address — the browser blocks a request, a
// data: or blob: address the page makes itself.
/** @type {Functions.ImageInfoSandbox.Format.canBlock} */
export function canBlock(image) {
	return image.scheme === "http" || image.scheme === "https";
}

// Does the listing have everything about the image — the HTTP response headers of a request that did not fail, and the
// metadata of its file? (A later listing without them takes the badge ✓ away again.)
/** @type {Functions.ImageInfoSandbox.Format.hasAllInfo} */
export function hasAllInfo(image) {
	return image.network !== null && image.network.headers.length > 0 && !loadFailed(image) && metadataOf(image) !== null;
}

// Can the image be saved from what the browser already has, without downloading it again — a data: address, a blob:
// address of the page, or a file the listing read from the HTTP cache of the same origin? (Otherwise the button downloads it.)
/** @type {Functions.ImageInfoSandbox.Format.canSaveFromBrowser} */
export function canSaveFromBrowser(image) {
	return image.scheme === "data" || image.scheme === "blob" || (!!image.file && image.file.source === "cache");
}

// A length of the width or height attribute in pixels — a number, with "px" or without; a percentage or another unit
// (SVG) says nothing about the size of the image (null).
/** @type {Functions.ImageInfoSandbox.Format.attributeLength} */
export function attributeLength(value) {
	const match = value ? /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(?:px)?\s*$/i.exec(value) : null;
	return match ? Number(match[1]) : null;
}

// The size from the sizes attribute of an icon ("16x16 32x32" — the largest width and height); "any" (a vector icon)
// or a value of another form (sizes of an <img> are widths of the layout, without a height) = null.
/** @type {Functions.ImageInfoSandbox.Format.sizesDimensions} */
export function sizesDimensions(value) {
	const tokens = value ? value.trim().split(/\s+/) : [];
	/** @type {[number, number] | null} */
	let largest = null;
	for (const token of tokens) {
		const match = /^(\d+)x(\d+)$/i.exec(token);
		if (!match) return null;
		largest = largest ? [Math.max(largest[0], Number(match[1])), Math.max(largest[1], Number(match[2]))] : [Number(match[1]), Number(match[2])];
	}
	return largest;
}

// The size of the image by one of its usages: the width and height attributes of HTML, otherwise the rendered size (an
// element that shows something — not a hidden one, not an <img> that has not loaded or failed: its box is a
// placeholder), otherwise sizes of an icon; null = the usage does not say.
/** @type {Functions.ImageInfoSandbox.Format.usageDimensions} */
export function usageDimensions(usage, failed) {
	const width = attributeLength(usage.width);
	const height = attributeLength(usage.height);
	if (width !== null && height !== null) return [width, height];
	if (usage.renderedWidth && usage.renderedHeight && usage.complete !== false && !failed) return [usage.renderedWidth, usage.renderedHeight];
	return sizesDimensions(usage.sizes);
}

// The estimated size of an image whose pixels are not known — the largest width and height its usages say (an image
// the page shows large somewhere is not small); null = no usage says.
/** @type {Functions.ImageInfoSandbox.Format.estimatedDimensions} */
export function estimatedDimensions(image) {
	const failed = loadFailed(image);
	/** @type {[number, number] | null} */
	let largest = null;
	for (const usage of image.usages) {
		const dimensions = usageDimensions(usage, failed);
		if (dimensions) largest = largest ? [Math.max(largest[0], dimensions[0]), Math.max(largest[1], dimensions[1])] : dimensions;
	}
	if (largest) return largest;
	// Nothing better known — the rendered size even of an <img> that has not loaded or failed (the box the page gives it).
	for (const usage of image.usages) {
		if (!usage.renderedWidth || !usage.renderedHeight) continue;
		largest = largest ? [Math.max(largest[0], usage.renderedWidth), Math.max(largest[1], usage.renderedHeight)] : [usage.renderedWidth, usage.renderedHeight];
	}
	return largest;
}

// Is the image an ICO file — by the file, Content-Type (image/x-icon, image/vnd.microsoft.icon) or the extension?
/** @type {Functions.ImageInfoSandbox.Format.isIcoImage} */
export function isIcoImage(image) {
	const format = imageFormat(image);
	return format === "ICO" || format === "ICON" || format === "VND.MICROSOFT.ICON";
}

// Is the image small — smaller than the width and at the same time than the height? Its size in pixels, otherwise the
// estimate by its usages (the size in HTML, the rendered size, sizes — and when none of them says, the box the page gives
// an <img> that has not loaded or failed, see estimatedDimensions()); no size known = no, except an ICO file (a favicon
// — small icons almost always) and an image the page has not loaded and shows nowhere (rendered 0 × 0 everywhere — a
// hidden one, a lazy <img> without a size: it takes no place on the page).
/** @type {Functions.ImageInfoSandbox.Format.isSmallImage} */
export function isSmallImage(image, width, height) {
	const dimensions = imageDimensions(image) ?? estimatedDimensions(image);
	if (dimensions === null) return isIcoImage(image) || (notLoaded(image) && image.usages.every((usage) => usage.renderedWidth === 0 || usage.renderedHeight === 0));
	return dimensions[0] < width && dimensions[1] < height;
}

// The images in the order: as on the page (the order of the listing), the largest first, by the file name, by the format.
/** @type {Functions.ImageInfoSandbox.Format.sortImages} */
export function sortImages(images, order) {
	const indexed = images.map((image, index) => ({ image, index }));
	const collator = new Intl.Collator(getUiLocale(), { numeric: true, sensitivity: "base" });
	if (order === "size") indexed.sort((a, b) => (imageBytes(b.image) ?? -1) - (imageBytes(a.image) ?? -1) || a.index - b.index);
	else if (order === "name") indexed.sort((a, b) => collator.compare(fileName(a.image.url), fileName(b.image.url)) || a.index - b.index);
	else if (order === "type") indexed.sort((a, b) => collator.compare(imageFormat(a.image) ?? "~", imageFormat(b.image) ?? "~") || a.index - b.index);
	return indexed.map((item) => item.image);
}

// Does the image match the searched text (the address, alt and title, the format, the element, the camera, a header)?
/** @type {Functions.ImageInfoSandbox.Format.matchesFilter} */
export function matchesFilter(image, text) {
	const needle = text.trim().toLowerCase();
	if (!needle) return true;
	const metadata = metadataOf(image);
	const haystack = [
		image.url,
		imageFormat(image) ?? "",
		...image.usages.flatMap((usage) => [usage.alt ?? "", usage.title ?? "", usage.element ?? "", usage.property ?? ""]),
		...(metadata ? [metadata.summary.camera ?? "", metadata.summary.author ?? "", metadata.summary.title ?? "", metadata.summary.description ?? ""] : []),
		...(image.network ? image.network.headers.map(([name, value]) => `${name}: ${value}`) : []),
	];
	return haystack.some((value) => value.toLowerCase().includes(needle));
}

// The address of the page for cleaning dynamically: of the document of the main frame (the tab may already have the address
// of a navigation that has not replaced the document yet), without the frames of the tab; without the fragment — a jump
// within the page (#…) brings no new content.
/** @type {Functions.ImageInfoSandbox.Format.pageAddress} */
export function pageAddress(page) {
	const top = page.frames.find((frame) => frame.frameId === 0);
	const url = top ? top.url : page.tab ? page.tab.url : null;
	return url ? url.split("#")[0] : null;
}

// Cleaning dynamically after another listing: another tab or another document (an unknown one too) starts it again; a new
// address of the same document (history.pushState() of a web app) takes the usage counts of the images of the previous
// listing as the images listed before the change — isCleared() leaves them out until the next change.
/** @type {Functions.ImageInfoSandbox.Format.nextCleaning} */
export function nextCleaning(cleaning, page) {
	const tabId = page && page.tab ? page.tab.tabId : null;
	const documentAt = page ? page.documentAt ?? null : null;
	const address = page ? pageAddress(page) : null;
	const last = new Map(page ? page.images.map((image) => [image.key, image.usageCount]) : []);
	if (tabId === null || documentAt === null || tabId !== cleaning.tabId || documentAt !== cleaning.documentAt) return { tabId, documentAt, address, last, before: new Map() };
	const moved = address !== null && cleaning.address !== null && address !== cleaning.address;
	return { tabId, documentAt, address: address ?? cleaning.address, last, before: moved ? cleaning.last : cleaning.before };
}

// Did the listing have the image before the page changed its address (cleaning dynamically)? Not when the page now uses
// it in more places than then — the new content shows it (an image preloaded before the change, the same one in a new place).
/** @type {Functions.ImageInfoSandbox.Format.isCleared} */
export function isCleared(image, cleaning) {
	const count = cleaning.before.get(image.key);
	return count !== undefined && image.usageCount <= count;
}

// The position on OpenStreetMap.
/** @type {Functions.ImageInfoSandbox.Format.mapUrl} */
export function mapUrl(gps) {
	return `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=16/${gps.latitude}/${gps.longitude}`;
}

// --- The permanent records of images (MAX_PERMANENT_RECORDS of module.mjs) ---

// The image for its permanent record: at most RECORD_LIMITS.usages of its usages (usageCount stays — the details say how
// many more there were), the values of the headers and of the entries of the metadata at most RECORD_LIMITS.value
// characters, at most RECORD_LIMITS.entries entries of the metadata (the first ones, the groups stay; with some left out
// the metadata has the warning "limit").
/** @type {Functions.ImageInfoSandbox.Format.compactRecordImage} */
export function compactRecordImage(image) {
	/** @type {Functions.ImageInfoSandbox.Format.compactRecordImage.clip} */
	const clip = ([name, value]) => [name, clipText(value, RECORD_LIMITS.value)];
	const network = image.network ? { ...image.network, headers: image.network.headers.map(clip) } : null;
	let file = image.file;
	if (file && file.source !== null) {
		let left = RECORD_LIMITS.entries;
		let cut = false;
		const groups = file.metadata.groups.map((group) => {
			const entries = group.entries.slice(0, left).map(clip);
			cut ||= entries.length < group.entries.length;
			left -= entries.length;
			return { ...group, entries };
		});
		const warnings = cut && !file.metadata.warnings.includes("limit") ? [...file.metadata.warnings, "limit"] : file.metadata.warnings;
		file = { ...file, metadata: { ...file.metadata, groups, warnings } };
	}
	return { ...image, usages: image.usages.slice(0, RECORD_LIMITS.usages), network, file };
}

// The permanent record of an image of the page (the payload of api.data.log()): the image (compactRecordImage()), the page of
// the tab and whether it is https, the properties of the image now (noticeTags()), its serial numbers of the camera and of the
// lens (serialIds() — the matches and the group of the record, read from the whole metadata), why it is recorded (auto — the
// properties whose "record" is on, null = the button) and the time.
/** @type {Functions.ImageInfoSandbox.Format.permanentRecord} */
export function permanentRecord(image, page, limits, auto, now = Date.now()) {
	const context = noticeContext(page, limits);
	return {
		version: RECORD_VERSION,
		image: compactRecordImage(image),
		page: { url: page && page.tab ? page.tab.url : null, title: page && page.tab ? page.tab.title : null },
		pageSecure: context.pageSecure,
		tags: noticeTags(image, context),
		cameraSerials: serialIds(image, "camera"),
		lensSerials: serialIds(image, "lens"),
		auto,
		recordedAt: now,
	};
}

// A record of the core (api.data.listLatest(), findByKey()) as a permanent record of an image: its id and the record — null
// = not one the listing can show. The module stored it, but it may come from a backup of another version: the missing parts
// of the image are empty, unknown properties are left out, without its own time the time of the record of the core. A record
// of version 1 (without the serial numbers) has the serial numbers of its image; one of version 2 (the serial numbers of the
// camera and of the lens in one list, the property "serial" for both) has its serial numbers sorted by the metadata of its
// image — one the shortened metadata no longer has counts as one of the camera — and the property "lensSerial" when its image
// has a serial number of the lens ("serial" stays only with one of the camera, or with neither in the metadata).
/** @type {Functions.ImageInfoSandbox.Format.readRecordEntry} */
export function readRecordEntry(entry) {
	if (!entry || typeof entry !== "object") return null;
	const { id, payload, timestamp } = /** @type {Record<string, unknown>} */ (entry);
	if (typeof id !== "number" || !payload || typeof payload !== "object") return null;
	const record = /** @type {Record<string, unknown>} */ (payload);
	const image = /** @type {Record<string, unknown> | null} */ (record.image && typeof record.image === "object" ? record.image : null);
	if (!image || typeof image.key !== "string" || typeof image.url !== "string" || typeof image.scheme !== "string" || !Array.isArray(image.usages)) return null;
	const page = /** @type {Record<string, unknown>} */ (record.page && typeof record.page === "object" ? record.page : {});
	const read = /** @type {Types.ImageInfo.ImageEntry} */ ({
		...image,
		sameOrigin: typeof image.sameOrigin === "boolean" ? image.sameOrigin : null,
		usageCount: typeof image.usageCount === "number" ? image.usageCount : image.usages.length,
		timing: image.timing && typeof image.timing === "object" ? image.timing : null,
		network: image.network && typeof image.network === "object" ? image.network : null,
		file: image.file && typeof image.file === "object" ? image.file : null,
	});
	/** @type {Functions.ImageInfoSandbox.Format.readRecordEntry.ids} */
	const ids = (value) => (Array.isArray(value) ? [...new Set(value.filter((serial) => typeof serial === "string" && serial !== ""))] : null);
	const storedCamera = ids(record.cameraSerials);
	const storedLens = ids(record.lensSerials);
	const legacy = !storedCamera || !storedLens;
	let cameraSerials = storedCamera ?? [];
	let lensSerials = storedLens ?? [];
	// The old property "serial" (the camera or the lens): which of them the image has.
	let legacyKinds = { camera: true, lens: false };
	if (legacy) {
		try {
			const cameraIds = serialIds(read, "camera");
			const lensIds = serialIds(read, "lens");
			const stored = ids(record.serials);
			cameraSerials = stored ? stored.filter((serial) => cameraIds.includes(serial) || !lensIds.includes(serial)) : cameraIds;
			lensSerials = stored ? stored.filter((serial) => lensIds.includes(serial)) : lensIds;
			const camera = serialNumber(read, "camera") !== null;
			const lens = serialNumber(read, "lens") !== null;
			legacyKinds = { camera: camera || !lens, lens };
		} catch {
			// The metadata of a damaged record.
			cameraSerials = [];
			lensSerials = [];
		}
	}
	/** @type {Functions.ImageInfoSandbox.Format.readRecordEntry.tags} */
	const tags = (value) => {
		if (!Array.isArray(value)) return [];
		const known = new Set(value);
		if (legacy && known.has("serial")) {
			if (!legacyKinds.camera) known.delete("serial");
			if (legacyKinds.lens) known.add("lensSerial");
		}
		return NOTICE_TAGS.filter((tag) => known.has(tag));
	};
	return {
		id,
		record: {
			version: typeof record.version === "number" ? record.version : RECORD_VERSION,
			image: read,
			page: { url: typeof page.url === "string" ? page.url : null, title: typeof page.title === "string" ? page.title : null },
			pageSecure: record.pageSecure === true,
			tags: tags(record.tags),
			cameraSerials,
			lensSerials,
			auto: Array.isArray(record.auto) ? tags(record.auto) : null,
			recordedAt: typeof record.recordedAt === "number" ? record.recordedAt : typeof timestamp === "number" ? timestamp : 0,
		},
	};
}

// The page of a permanent record in a few words: its title, otherwise the host of its address (the address itself when it has
// none); "" = the record does not know the page.
/** @type {Functions.ImageInfoSandbox.Format.recordPageLabel} */
export function recordPageLabel(page) {
	if (page.title && page.title.trim()) return page.title.trim();
	if (!page.url) return "";
	try {
		return new URL(page.url).host || page.url;
	} catch {
		return page.url;
	}
}

// The images of the listing to record permanently by themselves: those with a property whose "record" is on — any image of
// the page (also one it only loaded or one removed from it) —, except the keys in skip (recorded already, removed by the
// user, being recorded), each with those properties.
/** @type {Functions.ImageInfoSandbox.Format.recordCandidates} */
export function recordCandidates(page, notices, skip, limits) {
	const context = noticeContext(page, limits);
	return page.images.flatMap((image) => {
		if (skip.has(image.key)) return [];
		const auto = noticeTags(image, context).filter((tag) => notices[tag].record);
		return auto.length > 0 ? [{ image, auto }] : [];
	});
}

// The place of a permanent record in a word: the host of its page, otherwise the label of the page (recordPageLabel()).
/** @type {Functions.ImageInfoSandbox.Format.recordSite} */
export function recordSite(page) {
	if (page.url && /^https?:/i.test(page.url)) {
		try {
			const { host } = new URL(page.url);
			if (host) return host;
		} catch {
			// Not an address — the label below.
		}
	}
	return recordPageLabel(page);
}

// The matches of the serial numbers of the images of the page with the permanent records (SERIAL_MATCH_NOTIFY_KEY and
// LENS_SERIAL_MATCH_NOTIFY_KEY of module.mjs): for every image with a serial number (serialIds()) the records of ANOTHER image
// (another key) recorded on ANOTHER page (another address without the fragment than the page of the listing — a gallery of one
// camera does not match itself) that have one of its serial numbers of the same kind (a serial number of the camera matches
// only a serial number of the camera, of the lens only of the lens) — the images in the order of the page, each with the
// serial numbers that match (those of the camera first) and the records newest first (each once).
/** @type {Functions.ImageInfoSandbox.Format.serialMatches} */
export function serialMatches(page, records) {
	const address = pageAddress(page);
	/** @type {Map<string, Types.ImageInfoSandbox.RecordEntry[]>} */
	const bySerial = new Map();
	for (const entry of records) {
		const url = entry.record.page.url;
		if (url !== null && address !== null && url.split("#")[0] === address) continue;
		for (const kind of SERIAL_KINDS) {
			for (const serial of recordSerials(entry.record, kind)) {
				const key = serialRefKey({ kind, serial });
				const list = bySerial.get(key);
				if (list) list.push(entry);
				else bySerial.set(key, [entry]);
			}
		}
	}
	/** @type {Types.ImageInfoSandbox.SerialMatch[]} */
	const matches = [];
	if (bySerial.size === 0) return matches;
	for (const image of page.images) {
		/** @type {Types.ImageInfoSandbox.SerialRef[]} */
		const serials = [];
		/** @type {Map<number, Types.ImageInfoSandbox.RecordEntry>} */
		const found = new Map();
		for (const kind of SERIAL_KINDS) {
			for (const serial of serialIds(image, kind)) {
				const others = (bySerial.get(serialRefKey({ kind, serial })) ?? []).filter((entry) => entry.record.image.key !== image.key);
				if (others.length === 0) continue;
				serials.push({ kind, serial });
				for (const entry of others) found.set(entry.id, entry);
			}
		}
		if (found.size > 0) matches.push({ image, serials, records: [...found.values()].sort((a, b) => b.record.recordedAt - a.record.recordedAt || b.id - a.id) });
	}
	return matches;
}

// The matches of some kinds of the serial numbers only (the notification of the kinds whose setting is on): each match with
// its serial numbers of those kinds and the records that have one of them; a match without them is left out.
/** @type {Functions.ImageInfoSandbox.Format.matchesOfKinds} */
export function matchesOfKinds(matches, kinds) {
	return matches.flatMap((match) => {
		const serials = match.serials.filter(({ kind }) => kinds.has(kind));
		if (serials.length === 0) return [];
		const records = match.records.filter((entry) => serials.some(({ kind, serial }) => recordSerials(entry.record, kind).includes(serial)));
		return [{ ...match, serials, records }];
	});
}

// What to announce of the matches: the keys ("<key of the image>\n<kind> <serial number>") the document has not announced yet.
/** @type {Functions.ImageInfoSandbox.Format.newMatches} */
export function newMatches(matches, announced) {
	return matches.flatMap(({ image, serials }) => serials.map(({ kind, serial }) => `${image.key}\n${kind} ${serial}`).filter((key) => !announced.has(key)));
}

// The matches by the serial number (the text of a notification, the badge of an image): every serial number of a kind once, in
// the order of the matches, with the places of its records (recordSite(), each once, newest first) and how many records it has.
/** @type {Functions.ImageInfoSandbox.Format.matchSummary} */
export function matchSummary(matches) {
	/** @type {Map<string, { ref: Types.ImageInfoSandbox.SerialRef; places: Set<string>; records: Set<number> }>} */
	const bySerial = new Map();
	for (const { serials, records } of matches) {
		for (const ref of serials) {
			const key = serialRefKey(ref);
			const item = bySerial.get(key) ?? { ref, places: new Set(), records: new Set() };
			for (const entry of records) {
				if (!recordSerials(entry.record, ref.kind).includes(ref.serial)) continue;
				item.records.add(entry.id);
				const place = recordSite(entry.record.page);
				if (place) item.places.add(place);
			}
			bySerial.set(key, item);
		}
	}
	return [...bySerial.values()].map(({ ref, places, records }) => ({ kind: ref.kind, serial: ref.serial, places: [...places], records: records.size }));
}

// The permanent records for their section, merged by the serial number: a group for every serial number of the camera, or of
// the lens of the records without one of the camera (groupSerial() — the key the record is stored under), with at least two
// records, at the place of its newest record; the other records alone — in the order of the records (newest first).
/** @type {Functions.ImageInfoSandbox.Format.groupRecords} */
export function groupRecords(records) {
	const serials = records.map((entry) => groupSerial(entry.record.cameraSerials, entry.record.lensSerials));
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const serial of serials) {
		if (serial) counts.set(serialRefKey(serial), (counts.get(serialRefKey(serial)) ?? 0) + 1);
	}
	/** @type {Map<string, Types.ImageInfoSandbox.RecordGroup>} */
	const groups = new Map();
	/** @type {Types.ImageInfoSandbox.RecordGroup[]} */
	const result = [];
	records.forEach((entry, index) => {
		const serial = serials[index];
		const key = serial ? serialRefKey(serial) : "";
		if (!serial || (counts.get(key) ?? 0) < 2) {
			result.push({ serial: null, entries: [entry] });
			return;
		}
		let group = groups.get(key);
		if (!group) {
			group = { serial, entries: [] };
			groups.set(key, group);
			result.push(group);
		}
		group.entries.push(entry);
	});
	return result;
}

// The keys of the images whose permanent record the user removed, from the stored value (DISMISSED_STATE_KEY of module.mjs).
/** @type {Functions.ImageInfoSandbox.Format.dismissedKeys} */
export function dismissedKeys(stored) {
	return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
}

// The stored keys with the key of an image added (dismissed: its record removed) or taken away (recorded by the button again)
// — the newest last, at most MAX_DISMISSED_RECORDS of them (the oldest go).
/** @type {Functions.ImageInfoSandbox.Format.dismissRecord} */
export function dismissRecord(stored, key, dismissed) {
	const keys = [...dismissedKeys(stored)].filter((item) => item !== key);
	if (dismissed) keys.push(key);
	return keys.slice(-MAX_DISMISSED_RECORDS);
}
