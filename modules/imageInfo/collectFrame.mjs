//@ts-check
"use strict";

// modules/imageInfo/collectFrame.mjs
// The images of one frame of the page — the background part runs a small function in every frame of the
// tab (chrome.scripting.executeScript, allFrames), which imports this file into the isolated world of the
// extension in that frame and calls collectFrame(). It returns plain data (Types.ImageInfo.FrameReport):
//
// - where the frame uses images (usages): <img> (with its <picture> sources, srcset, sizes, loading, the
//   width and height attributes, the natural and the rendered size, what gives it a text description —
//   textLabel()), <input type="image">, <image> and
//   <feImage> of SVG, the poster of a <video>, the icons and preloaded images of <link>, and images from
//   CSS — background-image, mask-image, border-image-source, list-style-image and content, also of ::before
//   and ::after, in the document and in open shadow roots (a limited number of elements and a time limit —
//   getComputedStyle() of every element costs something);
// - what Resource Timing says about loading them (sizes, duration, status, protocol, from the cache);
// - the metadata of the files (metadata.mjs) — read only from what the browser already has: an address of
//   the same origin as the frame from the HTTP cache (fetch with cache: "only-if-cached", which never goes
//   to the network — the browser allows it only for the same origin), a data: address from itself, a blob:
//   address from the memory of the page. The request carries the Accept header the browser sent with the
//   image (the background part recorded it) — with "Vary: Accept" the cache answers only to the same one.
//   An image of another origin cannot be read this way without downloading it again — it stays without
//   metadata (in Firefox the background part can read it while it loads, see background-script.mjs).
//
// Files read once stay in the memory of this module for the life of the document, so another listing of
// the same page does not read them again. A data: address can be megabytes long — the result carries its
// key (the type, the length and a hash) instead of it.
//
// What of the images the user sees — imageInfoSandbox highlights them in its listing. The elements of the last
// listing of the document stay here with the keys of their images. While the listing asks (watchView() — the
// background part runs it again every few seconds, see WATCH_MESSAGE of module.mjs) the frame follows them and
// reports to the background part (VIEW_REPORT_MESSAGE) which images are visible — at least a pixel of the element
// in the viewport (IntersectionObserver, which also clips by the frames and the scrolled boxes around it), not
// hidden by visibility or opacity — and which one is under the mouse pointer, or was tapped last on a touch screen.
// Under the pointer is the topmost element of the listing at its point (elementsFromPoint(), also in open shadow
// roots), unless something of another part of the page covers it — a dialog, a banner, the floating window of the
// extension; its own content and an overlay in the same box (a link over a card) do not. An element the page made
// ignore the pointer (pointer-events: none) is never under it. Without another request the frame stops after the
// lease (VIEW_LEASE_MS of module.mjs) — a closed listing leaves nothing running in the page.
//
// The button "Remove from the document" of imageInfoSandbox removes an image of the last listing from the document
// (removeImage() — the background part runs it in the frames that use it, see REMOVE_MESSAGE of module.mjs). Its usages
// stay in the next listings of the document marked removed, until the page uses the image again; a new document (the
// page reloaded) has it back.
//
// The marks of imageInfoSandbox: the properties of images the user wants to see on the page itself (its settings, the column
// "On the page") as a badge with their icons over every element of the last listing that shows such an image, with the details
// in a tip under the mouse pointer (markImages() — the background part runs it again every few seconds while the listing is
// shown, see MARK_MESSAGE of module.mjs). The badges live in one element of the extension at the end of the document, in a
// closed shadow root — the scripts and the styles of the page do not get in. They follow their elements (scrolling, a change
// of the size, the layout of the page moving) and are hidden while the element is not visible or something of another part of
// the page covers its corner (a dialog, a fixed bar). Without another request the frame takes them away after the lease — a
// closed listing leaves nothing in the page.
import { parseImageMetadata } from "./metadata.mjs";

// The message of the reports of a frame to the background part ({ visible, hovered } — the keys of the images).
export const VIEW_REPORT_MESSAGE = "IMAGE_INFO_VIEW_REPORT";
// How long after a change the report goes (scrolling changes the visible images many times a second).
const VIEW_REPORT_DELAY_MS = 50;
// The longest lease a request may give.
const VIEW_MAX_LEASE_MS = 60000;
// How deep elementsFromPoint() goes into shadow roots in shadow roots.
const VIEW_MAX_SHADOW_DEPTH = 8;
// The events of the pointer the frame follows while the listing asks.
const VIEW_POINTER_EVENTS = /** @type {const} */ (["pointermove", "pointerover", "pointerdown", "pointerout"]);

// The Accept header of images the browsers send by default — when the background part did not record
// the real one (headers are not recorded).
const DEFAULT_ACCEPT = /\bFirefox\//.test(navigator.userAgent) ? "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5" : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

// Resource Timing entries of these initiators are images (or may be); the others only with an image
// Content-Type.
const IMAGE_INITIATORS = new Set(["img", "image", "imageset", "input", "css", "link", "icon", "other"]);

// The CSS properties with images, read for every element and its ::before and ::after.
const CSS_PROPERTIES = /** @type {const} */ (["background-image", "mask-image", "-webkit-mask-image", "border-image-source", "list-style-image", "content"]);

// The attribute of an element whose image of ::before or ::after was removed (removeImage()): the tokens "<pseudo>-<property>"
// ("before-background-image", "after-content", …) select the rules of REMOVED_CSS.
export const REMOVED_ATTRIBUTE = "data-image-info-removed";

// The properties set to none for a removed image of a property — mask-image and -webkit-mask-image are the same image.
/** @type {Functions.ImageInfo.CollectFrame.removedProperties} */
function removedProperties(property) {
	return property === "mask-image" || property === "-webkit-mask-image" ? ["mask-image", "-webkit-mask-image"] : [property];
}

// The rules that turn off the removed images of ::before and ::after — the background part inserts them into the document
// with the "USER" origin (an important declaration of the user wins over every rule of the page and the CSP of the page does
// not apply to them), an open shadow root adopts them (the rules of the document do not reach into it).
export const REMOVED_CSS = ["before", "after"]
	.flatMap((pseudo) => CSS_PROPERTIES.map((property) => `[${REMOVED_ATTRIBUTE}~="${pseudo}-${property}"]::${pseudo} { ${removedProperties(property).map((name) => `${name}: none !important;`).join(" ")} }`))
	.join("\n");

// The read files of this document: key (with the Accept header and the limits of the metadata — changed
// settings read the file again) → the result (or the read in progress). Errors that may pass (the image is not
// in the cache yet) are not kept.
/** @type {Map<string, Promise<Types.ImageInfo.FileResult>>} */
const readFiles = new Map();
// The addresses this module fetched — their Resource Timing entries (Firefox lists them) are not the page's.
/** @type {Set<string>} */
const ownFetches = new Set();
// The reads the Content-Security-Policy of the page blocked: Firefox applies connect-src of the page to the requests of
// the extension in it (verified in Firefox 157 — an error in the console of the page for every one; Chrome exempts its
// isolated world). After the first one the document reads no more files from the cache.
/** @type {Set<string>} */
const blockedByCsp = new Set();
// The addresses of the images the last listings of this document reported, by their keys (readImageFile()).
/** @type {Map<string, string>} */
const knownUrls = new Map();
// What the frame follows for the highlights of the listing (see the comment at the beginning).
/** @type {Types.ImageInfo.ViewTracker} */
const view = { targets: new Map(), observer: null, visible: new Set(), hovered: null, pointer: null, leaseTimer: null, reportTimer: null, frame: 0, sent: null };
// The places of the last listing of the document where removeImage() can remove an image, by its key.
/** @type {Map<string, Types.ImageInfo.RemovablePlace[]>} */
const removable = new Map();
// The images removed from this document (removeImage()), by their keys: the full address and the usages they had.
/** @type {Map<string, Types.ImageInfo.RemovedImage>} */
const removed = new Map();
// The shadow roots that adopted REMOVED_CSS, and whether the document asked the background part for it.
/** @type {WeakSet<ShadowRoot>} */
const removedRoots = new WeakSet();
let removedCssRequested = false;
// The marks of imageInfoSandbox on the page (see the comment at the beginning).
/** @type {Types.ImageInfo.MarkState} */
const pageMarks = { images: new Map(), source: "", host: null, layer: null, tip: null, tipFor: null, badges: new Map(), visible: new Set(), observer: null, resizer: null, leaseTimer: null, positionTimer: null, frame: 0 };

// The element of the marks at the end of the document — its inline style with !important wins over every rule of the page (and
// the CSP of the page does not apply to the CSSOM); just under the floating window of the extension (z-index 2147483647).
const MARK_HOST_TAG = "extension-image-info-marks";
/** @type {[string, string][]} */
const MARK_HOST_STYLE = [
	["all", "initial"],
	["display", "block"],
	["position", "absolute"],
	["top", "0"],
	["left", "0"],
	["width", "0"],
	["height", "0"],
	["margin", "0"],
	["padding", "0"],
	["border", "0"],
	["overflow", "visible"],
	["transform", "none"],
	["z-index", "2147483646"],
	["pointer-events", "none"],
];
// The look of the badges and of the tip in the closed shadow root (a constructed style sheet — the CSP of the page does not
// apply to it). The tip is above the badges; the forced colors of the system keep the borders.
const MARK_CSS = `
.layer { position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; pointer-events: none; direction: ltr; text-align: left; font: 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; }
.badge { position: absolute; display: none; box-sizing: border-box; padding: 1px 5px; border: 1px solid rgb(255 255 255 / 85%); border-radius: 9px; background: rgb(32 33 36 / 85%); box-shadow: 0 1px 3px rgb(0 0 0 / 45%); color: #fff; font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", system-ui, sans-serif; font-size: 13px; line-height: 16px; white-space: nowrap; cursor: help; user-select: none; pointer-events: auto; }
.badge--shown { display: block; }
.tip { position: absolute; z-index: 1; display: none; box-sizing: border-box; width: max-content; max-width: min(340px, calc(100vw - 8px)); padding: 6px 8px; border: 1px solid rgb(255 255 255 / 25%); border-radius: 6px; background: rgb(32 33 36 / 96%); box-shadow: 0 2px 10px rgb(0 0 0 / 50%); white-space: normal; overflow-wrap: anywhere; pointer-events: none; }
.tip--shown { display: block; }
.tip__source { color: #bdc1c6; font-size: 11px; }
.tip__name { margin-top: 4px; font-weight: 600; }
.tip__line { display: flex; gap: 6px; margin-top: 3px; }
.tip__icon { flex: none; width: 1.4em; text-align: center; font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", system-ui, sans-serif; }
.tip__label { display: block; font-weight: 600; }
.tip__detail { display: block; color: #e8eaed; }
@media (forced-colors: active) { .badge, .tip { border: 1px solid CanvasText; } }
`;
// How often the badges follow their elements without a scroll or a change of a size (the page moves its content), ms.
const MARK_POSITION_MS = 500;
// The most elements with a badge.
const MARK_MAX_ELEMENTS = 500;
// The distance of a badge from the corner of its element (px).
const MARK_INSET = 4;

// A violation of the CSP by a read of this module (the securitypolicyviolation event of the document).
/** @type {Functions.ImageInfo.CollectFrame.noteViolation} */
function noteViolation(event) {
	if (ownFetches.has(event.blockedURI)) blockedByCsp.add(event.blockedURI);
}
if (typeof document !== "undefined") document.addEventListener("securitypolicyviolation", noteViolation);

// Was the read of the address blocked by the CSP? The event comes a moment after the fetch fails.
/** @type {Functions.ImageInfo.CollectFrame.wasBlocked} */
async function wasBlocked(url) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return blockedByCsp.has(url);
}

// A 32-bit FNV-1a hash of a text (the key of a data: address).
/** @type {Functions.ImageInfo.CollectFrame.hashText} */
export function hashText(text) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

// The key of an image address: the address itself, a data: address as "data:<type>;…#<length>-<hash>".
/** @type {Functions.ImageInfo.CollectFrame.imageKey} */
export function imageKey(url) {
	if (!url.startsWith("data:")) return url;
	const comma = url.indexOf(",");
	const header = url.slice(0, comma < 0 ? Math.min(url.length, 100) : Math.min(comma, 100));
	return `${header}…#${url.length}-${hashText(url)}`;
}

// An absolute address of an attribute value, or null (empty, not an address, about:/javascript:).
/** @type {Functions.ImageInfo.CollectFrame.resolveUrl} */
export function resolveUrl(value, base) {
	if (!value || !value.trim()) return null;
	try {
		const url = new URL(value.trim(), base);
		return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:" || url.protocol === "blob:" ? url.href : null;
	} catch {
		return null;
	}
}

// The url(…) addresses of a computed CSS value (also inside image-set()).
/** @type {Functions.ImageInfo.CollectFrame.cssUrls} */
export function cssUrls(value) {
	if (!value || !value.includes("url(")) return [];
	/** @type {string[]} */
	const urls = [];
	for (const match of value.matchAll(/url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/g)) {
		const raw = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(.)/g, "$1");
		if (raw) urls.push(raw);
	}
	return urls;
}

// The bytes of a data: address (base64 or percent-encoded), at most limit bytes.
/** @type {Functions.ImageInfo.CollectFrame.decodeDataUrl} */
export function decodeDataUrl(url, limit) {
	const comma = url.indexOf(",");
	if (comma < 0) throw new Error("data:");
	const header = url.slice(5, comma).toLowerCase();
	const body = url.slice(comma + 1);
	const contentType = header.split(";")[0] || "text/plain";
	if (header.split(";").includes("base64")) {
		let clean = body.replace(/\s+/g, "");
		if (clean.includes("%")) {
			try {
				clean = decodeURIComponent(clean);
			} catch {
				// Not percent-encoded after all — atob() decides.
			}
		}
		// Whole groups of 4 characters (3 bytes) up to the limit.
		const characters = Math.ceil(limit / 3) * 4;
		const binary = atob(clean.slice(0, characters));
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
		return { bytes, complete: clean.length <= characters, contentType };
	}
	/** @type {number[]} */
	const out = [];
	const encoder = new TextEncoder();
	for (let index = 0; index < body.length && out.length < limit; index++) {
		const char = body[index];
		if (char === "%" && /^[0-9a-f]{2}$/i.test(body.slice(index + 1, index + 3))) {
			out.push(parseInt(body.slice(index + 1, index + 3), 16));
			index += 2;
		} else {
			out.push(...encoder.encode(char));
		}
	}
	return { bytes: Uint8Array.from(out.slice(0, limit)), complete: out.length < limit, contentType };
}

// The body of a response, at most limit bytes (the rest is not read).
/** @type {Functions.ImageInfo.CollectFrame.readLimited} */
async function readLimited(response, limit) {
	if (!response.body) {
		const all = new Uint8Array(await response.arrayBuffer());
		return { bytes: all.subarray(0, limit), complete: all.length <= limit };
	}
	const reader = response.body.getReader();
	/** @type {Uint8Array[]} */
	const chunks = [];
	let total = 0;
	let complete = true;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.length;
		if (total > limit) {
			complete = false;
			await reader.cancel().catch(() => {});
			break;
		}
	}
	const bytes = new Uint8Array(Math.min(total, limit));
	let offset = 0;
	for (const chunk of chunks) {
		const part = chunk.subarray(0, bytes.length - offset);
		bytes.set(part, offset);
		offset += part.length;
	}
	return { bytes, complete };
}

// A response of an address of the same origin from the HTTP cache — never from the network: with the Accept the browser
// sent, the default one, none. null = not in the cache, "csp" = the CSP of the page blocked the read.
/** @type {Functions.ImageInfo.CollectFrame.cachedResponse} */
async function cachedResponse(url, accept, credentials) {
	ownFetches.add(url);
	for (const header of [...new Set([accept, DEFAULT_ACCEPT, null])]) {
		try {
			return await fetch(url, {
				cache: "only-if-cached",
				mode: "same-origin",
				credentials,
				redirect: "follow",
				...(header ? { headers: { Accept: header } } : {}),
			});
		} catch {
			// Not in the cache with this Accept (or not at all) — the browser did not go to the network. Or the CSP of the page
			// blocked it — then no other Accept helps.
			if (await wasBlocked(url)) return "csp";
		}
	}
	return null;
}

// Bytes as base64 (executeScript and messages pass only JSON-like data).
/** @type {Functions.ImageInfo.CollectFrame.toBase64} */
export function toBase64(bytes) {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
}

// The whole file of an image for saving (the button "Save" of imageInfoSandbox) — like readFile() only from what the browser
// already has, never from the network; anonymously the read from the cache carries no cookies (credentials: "omit"). A
// data: address by its key (the listing has only the key — the last collectFrame() of this document knows the address).
/** @type {Functions.ImageInfo.CollectFrame.readImageFile} */
export async function readImageFile({ key, accept, anonymous, maxBytes }) {
	const url = knownUrls.get(key) ?? (key.startsWith("data:") ? null : key);
	if (!url) return { error: "unknown" };
	try {
		/** @type {Types.ImageInfo.ReadBytes} */
		let read;
		let contentType = null;
		if (url.startsWith("data:")) {
			read = decodeDataUrl(url, maxBytes);
			contentType = read.contentType ?? null;
		} else {
			/** @type {Response | null | "csp"} */
			let response;
			if (blockedByCsp.size > 0) return { error: "csp" };
			if (url.startsWith("blob:")) {
				ownFetches.add(url);
				try {
					response = await fetch(url);
				} catch (err) {
					if (await wasBlocked(url)) return { error: "csp" };
					throw err;
				}
			} else {
				if (new URL(url).origin !== location.origin) return { error: "crossOrigin" };
				response = await cachedResponse(url, accept, anonymous ? "omit" : "same-origin");
			}
			if (response === "csp") return { error: "csp" };
			if (!response) return { error: "notCached" };
			if (!response.ok) return { error: "status", status: response.status };
			contentType = response.headers.get("content-type");
			read = await readLimited(response, maxBytes);
		}
		if (!read.complete) return { error: "tooLarge" };
		return { data: toBase64(read.bytes), contentType };
	} catch (err) {
		return { error: "failed", detail: err instanceof Error ? err.message : String(err) };
	}
}

// The file of an image from what the browser already has (see the comment at the beginning); never from
// the network.
/** @type {Functions.ImageInfo.CollectFrame.readFile} */
async function readFile(url, accept, limits, metadataLimits) {
	/** @type {Types.ImageInfo.ReadBytes} */
	let read;
	/** @type {Types.ImageInfo.FileSource} */
	let source;
	let contentType = null;
	if (url.startsWith("data:")) {
		source = "data";
		read = decodeDataUrl(url, limits.maxFileBytes);
		contentType = read.contentType ?? null;
	} else if (url.startsWith("blob:")) {
		source = "blob";
		if (blockedByCsp.size > 0) return { source: null, error: "csp" };
		ownFetches.add(url);
		/** @type {Response} */
		let response;
		try {
			response = await fetch(url);
		} catch (err) {
			if (await wasBlocked(url)) return { source: null, error: "csp" };
			throw err;
		}
		contentType = response.headers.get("content-type");
		read = await readLimited(response, limits.maxFileBytes);
	} else {
		if (new URL(url).origin !== location.origin) return { source: null, error: "crossOrigin" };
		source = "cache";
		if (blockedByCsp.size > 0) return { source: null, error: "csp" };
		const response = await cachedResponse(url, accept, "same-origin");
		if (response === "csp") return { source: null, error: "csp" };
		if (!response) return { source: null, error: "notCached" };
		if (!response.ok) return { source: null, error: "status", status: response.status };
		contentType = response.headers.get("content-type");
		read = await readLimited(response, limits.maxFileBytes);
	}
	const metadata = await parseImageMetadata(read.bytes, { complete: read.complete, ...metadataLimits });
	return { source, bytes: read.bytes.length, complete: read.complete, contentType, metadata };
}

// The same, with a time limit.
/** @type {Functions.ImageInfo.CollectFrame.readFileWithin} */
async function readFileWithin(url, accept, limits, metadataLimits) {
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve({ source: null, error: "timeLimit" }), limits.fileTimeMs);
	});
	try {
		return /** @type {Types.ImageInfo.FileResult} */ (await Promise.race([readFile(url, accept, limits, metadataLimits), timeout]));
	} catch (err) {
		return { source: null, error: "failed", detail: err instanceof Error ? err.message : String(err) };
	} finally {
		clearTimeout(timer);
	}
}

// A short description of an element: tag#id.class.class.
/** @type {Functions.ImageInfo.CollectFrame.describeElement} */
export function describeElement(element) {
	let text = element.localName;
	if (element.id) text += `#${element.id}`;
	const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).filter(Boolean) : [];
	if (classes.length) text += `.${classes.slice(0, 2).join(".")}`;
	return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

// The rendered size and visibility of an element.
/** @type {Functions.ImageInfo.CollectFrame.layout} */
function layout(element) {
	const rect = element.getBoundingClientRect();
	const width = Math.round(rect.width);
	const height = Math.round(rect.height);
	const inViewport = width > 0 && height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
	return { renderedWidth: width, renderedHeight: height, inViewport };
}

// All elements of the document and of the open shadow roots in it (at most limit).
/** @type {Functions.ImageInfo.CollectFrame.allElements} */
function allElements(root, limit, found = []) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
	for (let node = walker.nextNode(); node && found.length < limit; node = walker.nextNode()) {
		const element = /** @type {Element} */ (node);
		found.push(element);
		if (element.shadowRoot) allElements(element.shadowRoot, limit, found);
	}
	return found;
}

/** @type {Functions.ImageInfo.CollectFrame.attribute} */
function attribute(element, name) {
	const value = element.getAttribute(name);
	return value === null || value === "" ? null : value.length > 2000 ? `${value.slice(0, 1999)}…` : value;
}

// Does the element have a text — its content, or aria-label?
/** @type {Functions.ImageInfo.CollectFrame.hasText} */
function hasText(element) {
	return !!element && !!(element.getAttribute("aria-label")?.trim() || element.textContent?.trim());
}

// The text description of an image on the page (an <img>, an <input type="image">) for the badge "no text alternative" of
// imageInfoSandbox — what gives it, in the order the browsers compute the accessible name: aria-labelledby (an element of
// the same document or shadow root with a text), aria-label, alt (an <img> also an empty one — a decorative image; the
// button <input type="image"> needs a text), the <figcaption> of the <figure> the image is in, title; null = none of them.
/** @type {Functions.ImageInfo.CollectFrame.textLabel} */
export function textLabel(element) {
	const root = /** @type {Document | ShadowRoot} */ (element.getRootNode());
	const ids = (element.getAttribute("aria-labelledby") ?? "").trim().split(/\s+/).filter(Boolean);
	if (ids.some((id) => hasText(root.getElementById(id)))) return "aria-labelledby";
	if (element.getAttribute("aria-label")?.trim()) return "aria-label";
	const alt = element.getAttribute("alt");
	if (alt !== null && (element.localName === "img" || alt.trim())) return "alt";
	if (hasText(element.closest("figure")?.querySelector(":scope > figcaption") ?? null)) return "figcaption";
	if (element.getAttribute("title")?.trim()) return "title";
	return null;
}

// Where the frame uses images; the elements on the page (not the links of icons) with the keys of their images into targets,
// every usage with its element (and the pseudo-element and the property of CSS) into places.
/** @type {Functions.ImageInfo.CollectFrame.collectUsages} */
function collectUsages(limits, report, targets, places) {
	const base = document.baseURI;
	const elements = allElements(document, limits.maxElements);
	if (elements.length >= limits.maxElements) report.truncated.push("elements");
	/** @type {Types.ImageInfo.Usage[]} */
	const usages = report.usages;
	/** @type {Map<string, string>} */
	const fullUrls = new Map();
	const push = (
		/** @type {Element} */ element,
		/** @type {string} */ url,
		/** @type {Omit<Types.ImageInfo.Usage, 'key' | 'url'>} */ usage,
		/** @type {'before' | 'after' | null} */ pseudo = null,
		/** @type {string | null} */ property = null
	) => {
		if (usages.length >= limits.maxUsages) {
			if (!report.truncated.includes("usages")) report.truncated.push("usages");
			return;
		}
		const key = imageKey(url);
		fullUrls.set(key, url);
		/** @type {Types.ImageInfo.Usage} */
		const entry = { key, url: url.startsWith("data:") ? key : url, ...usage };
		usages.push(entry);
		const found = places.get(key);
		const place = { element, usage: entry, pseudo, property };
		if (found) found.push(place);
		else places.set(key, [place]);
		if (usage.kind === "icon" || usage.kind === "preload") return;
		const keys = targets.get(element);
		if (!keys) targets.set(element, [key]);
		else if (!keys.includes(key)) keys.push(key);
	};

	for (const element of elements) {
		const name = element.localName;
		if (name === "img") {
			const img = /** @type {HTMLImageElement} */ (element);
			const url = resolveUrl(img.currentSrc || img.getAttribute("src"), base);
			if (!url) continue;
			const picture = img.parentElement && img.parentElement.localName === "picture" ? img.parentElement : null;
			push(img, url, {
				kind: "img",
				element: describeElement(img),
				alt: img.hasAttribute("alt") ? img.getAttribute("alt") : null,
				label: textLabel(img),
				title: attribute(img, "title"),
				src: attribute(img, "src"),
				width: attribute(img, "width"),
				height: attribute(img, "height"),
				srcset: attribute(img, "srcset"),
				sizes: attribute(img, "sizes"),
				loading: attribute(img, "loading"),
				decoding: attribute(img, "decoding"),
				fetchPriority: attribute(img, "fetchpriority"),
				crossOrigin: attribute(img, "crossorigin"),
				referrerPolicy: attribute(img, "referrerpolicy"),
				naturalWidth: img.naturalWidth || null,
				naturalHeight: img.naturalHeight || null,
				complete: img.complete,
				sources: picture
					? [...picture.querySelectorAll(":scope > source")].map((source) => ({
							srcset: attribute(source, "srcset"),
							type: attribute(source, "type"),
							media: attribute(source, "media"),
							sizes: attribute(source, "sizes"),
						}))
					: null,
				...layout(img),
			});
		} else if (name === "input" && /** @type {HTMLInputElement} */ (element).type === "image") {
			const url = resolveUrl(element.getAttribute("src"), base);
			if (url) push(element, url, { kind: "input", element: describeElement(element), alt: attribute(element, "alt"), label: textLabel(element), src: attribute(element, "src"), width: attribute(element, "width"), height: attribute(element, "height"), ...layout(element) });
		} else if ((name === "image" || name === "feimage") && element.namespaceURI === "http://www.w3.org/2000/svg") {
			const url = resolveUrl(element.getAttribute("href") || element.getAttributeNS("http://www.w3.org/1999/xlink", "href"), base);
			if (url) push(element, url, { kind: "svg", element: describeElement(element), width: attribute(element, "width"), height: attribute(element, "height"), ...layout(element) });
		} else if (name === "video") {
			const url = resolveUrl(element.getAttribute("poster"), base);
			if (url) push(element, url, { kind: "poster", element: describeElement(element), width: attribute(element, "width"), height: attribute(element, "height"), ...layout(element) });
		} else if (name === "link") {
			const rel = (element.getAttribute("rel") || "").toLowerCase().split(/\s+/);
			const isIcon = rel.some((value) => value === "icon" || value === "apple-touch-icon" || value === "apple-touch-icon-precomposed" || value === "mask-icon");
			const isPreload = rel.includes("preload") && element.getAttribute("as") === "image";
			const url = resolveUrl(element.getAttribute("href"), base);
			if (url && (isIcon || isPreload)) push(element, url, { kind: isIcon ? "icon" : "preload", element: describeElement(element), sizes: attribute(element, "sizes"), type: attribute(element, "type") });
		}
	}

	// Images from CSS: the computed values of the element and its ::before and ::after.
	const started = performance.now();
	let checked = 0;
	for (const element of elements) {
		if (performance.now() - started > limits.cssTimeMs) {
			report.truncated.push("css");
			break;
		}
		checked++;
		for (const pseudo of [null, "::before", "::after"]) {
			const style = getComputedStyle(element, pseudo);
			if (pseudo && (style.content === "none" || style.content === "normal") && style.backgroundImage === "none") continue;
			// One usage for an address of the element (mask-image and -webkit-mask-image are the same in Firefox).
			/** @type {Set<string>} */
			const seen = new Set();
			for (const property of CSS_PROPERTIES) {
				if (property === "content" && !pseudo) continue;
				for (const raw of cssUrls(style.getPropertyValue(property))) {
					const url = resolveUrl(raw, base);
					if (!url || seen.has(url)) continue;
					seen.add(url);
					push(element, url, { kind: "css", element: describeElement(element), property: pseudo ? `${pseudo} ${property}` : property, ...layout(element) }, pseudo === "::before" ? "before" : pseudo === "::after" ? "after" : null, property);
				}
			}
		}
	}
	report.cssElements = checked;
	return fullUrls;
}

// What Resource Timing says about the images of the frame — the first entry of every address (the page
// may load an address more times; the count says how many).
/** @type {Functions.ImageInfo.CollectFrame.collectTimings} */
function collectTimings(report) {
	/** @type {Map<string, Types.ImageInfo.Timing>} */
	const timings = new Map();
	for (const entry of /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType("resource"))) {
		const contentType = typeof (/** @type {{ contentType?: unknown }} */ (entry).contentType) === "string" ? /** @type {{ contentType: string }} */ (/** @type {unknown} */ (entry)).contentType : "";
		const own = (entry.initiatorType === "fetch" || entry.initiatorType === "xmlhttprequest") && ownFetches.has(entry.name);
		if (own || !(IMAGE_INITIATORS.has(entry.initiatorType) || contentType.startsWith("image/"))) continue;
		if (entry.initiatorType === "other" && !contentType.startsWith("image/") && !/\.(?:ico|png|jpe?g|gif|webp|avif|svg|bmp)(?:[?#]|$)/i.test(entry.name)) continue;
		const known = timings.get(entry.name);
		if (known) {
			known.count++;
			continue;
		}
		const extra = /** @type {{ responseStatus?: number, deliveryType?: string, renderBlockingStatus?: string }} */ (/** @type {unknown} */ (entry));
		timings.set(entry.name, {
			key: imageKey(entry.name),
			url: entry.name.startsWith("data:") ? imageKey(entry.name) : entry.name,
			initiatorType: entry.initiatorType,
			startTime: Math.round(entry.startTime),
			duration: Math.round(entry.duration),
			transferSize: entry.transferSize,
			encodedBodySize: entry.encodedBodySize,
			decodedBodySize: entry.decodedBodySize,
			responseStatus: typeof extra.responseStatus === "number" ? extra.responseStatus : null,
			contentType: contentType || null,
			deliveryType: typeof extra.deliveryType === "string" ? extra.deliveryType : null,
			nextHopProtocol: entry.nextHopProtocol || null,
			renderBlockingStatus: typeof extra.renderBlockingStatus === "string" ? extra.renderBlockingStatus : null,
			count: 1,
		});
	}
	report.timings = [...timings.values()];
	return timings;
}

// The images of this frame (see the comment at the beginning).
/** @type {Functions.ImageInfo.CollectFrame.collectFrame} */
export async function collectFrame(options) {
	const started = performance.now();
	const { limits, metadata, accepts } = options;
	// The files the background part already read while they loaded (Firefox) — not again.
	const captured = new Set(options.captured || []);
	// Where the redirected images led (the background part recorded it).
	const finals = options.finals || {};
	/** @type {Types.ImageInfo.FrameReport} */
	const report = {
		url: location.href,
		origin: location.origin,
		title: document.title,
		contentType: document.contentType || null,
		readyState: document.readyState,
		timeOrigin: Math.round(performance.timeOrigin),
		usages: [],
		timings: [],
		files: {},
		truncated: [],
		cssElements: 0,
		elapsedMs: 0,
	};
	/** @type {Map<Element, string[]>} */
	const targets = new Map();
	/** @type {Map<string, Types.ImageInfo.RemovablePlace[]>} */
	const places = new Map();
	const fullUrls = collectUsages(limits, report, targets, places);
	removable.clear();
	for (const [key, list] of places) removable.set(key, list);
	addRemovedUsages(report, fullUrls);
	setViewTargets(targets);
	renderMarks();
	const timings = collectTimings(report);
	for (const url of timings.keys()) if (!fullUrls.has(imageKey(url))) fullUrls.set(imageKey(url), url);
	for (const [key, url] of fullUrls) knownUrls.set(key, url);

	// The files to read: the same origin, data: and blob: — at most maxFiles, the others are only reported. An image of
	// another origin (also one a redirect led to) cannot be read from the cache without the network — it says so right away.
	const wanted = [...fullUrls].filter(([key, url]) => {
		if (captured.has(url)) return false;
		if (url.startsWith("data:") || url.startsWith("blob:")) return true;
		try {
			if (new URL(url).origin === location.origin && new URL(finals[url] ?? url).origin === location.origin) return true;
		} catch {
			return false;
		}
		report.files[key] = { source: null, error: "crossOrigin" };
		return false;
	});
	// The cache first: the first read goes alone — when the CSP of the page blocks it (Firefox), the others do not even try
	// (one error in the console of the page instead of one for every file).
	const rank = (/** @type {string} */ url) => (url.startsWith("http") ? 0 : url.startsWith("blob:") ? 1 : 2);
	wanted.sort((a, b) => rank(a[1]) - rank(b[1]));
	const deadline = started + limits.totalTimeMs;
	let next = 0;
	let read = 0;
	const step = async () => {
		const [key, url] = wanted[next++];
		if (read >= limits.maxFiles) {
			report.files[key] = { source: null, error: "tooMany" };
			return;
		}
		if (performance.now() > deadline) {
			report.files[key] = { source: null, error: "timeLimit" };
			return;
		}
		read++;
		const accept = accepts[url] ?? null;
		const cacheKey = `${key}\n${accept ?? ""}\n${metadata ? `${metadata.maxEntries} ${metadata.maxXmpEntries}` : ""}`;
		let pending = readFiles.get(cacheKey);
		if (!pending) {
			pending = readFileWithin(url, accept, limits, metadata);
			readFiles.set(cacheKey, pending);
		}
		const result = await pending;
		// Not in the cache yet, a time limit or an error may pass — the next listing tries again (another origin and the CSP
		// of the document do not change).
		if (result.source === null && result.error !== "crossOrigin" && result.error !== "csp") readFiles.delete(cacheKey);
		report.files[key] = result;
	};
	const worker = async () => {
		while (next < wanted.length) await step();
	};
	if (wanted.length > 0) await step();
	await Promise.all(Array.from({ length: Math.min(limits.concurrency, wanted.length) }, worker));
	report.elapsedMs = Math.round(performance.now() - started);
	return report;
}

// --- Removing an image from the document (see the comment at the beginning) ---

// The usages of the images removed from this document into the report (removed: true) — their files are read like the others;
// an image the page uses again is no longer removed.
/** @type {Functions.ImageInfo.CollectFrame.addRemovedUsages} */
function addRemovedUsages(report, fullUrls) {
	const live = new Set(report.usages.map((usage) => usage.key));
	for (const [key, image] of removed) {
		if (live.has(key)) {
			removed.delete(key);
			continue;
		}
		report.usages.push(...image.usages);
		fullUrls.set(key, image.url);
	}
}

// Removes an image of the last listing from the document: an <img>, an <input type="image">, an SVG <image> and the <link> of
// an icon or of a preload go away, a <video> loses its poster, another SVG element (<feImage>) its href. An image from CSS is
// turned off — "none" with !important in the inline style of the element (it wins over the rules of the page, the CSP of the
// page does not apply to it); a pseudo-element has no inline style — the element gets a token in REMOVED_ATTRIBUTE that the
// rules of REMOVED_CSS select (the document gets them from the background part — styled: true the first time —, an open
// shadow root adopts them here). Returns how many usages of the image it removed.
/** @type {Functions.ImageInfo.CollectFrame.removeImage} */
export function removeImage({ key }) {
	const places = removable.get(key) ?? [];
	/** @type {Types.ImageInfo.Usage[]} */
	const usages = [];
	let styled = false;
	for (const place of places) {
		const done = removePlace(place);
		if (!done) continue;
		usages.push({ ...place.usage, removed: true });
		if (done === "document" && !removedCssRequested) {
			removedCssRequested = true;
			styled = true;
		}
		// The element no longer shows the image — the highlights do not follow it for it.
		const keys = view.targets.get(place.element);
		const rest = keys ? keys.filter((other) => other !== key) : [];
		if (rest.length) {
			view.targets.set(place.element, rest);
		} else if (keys) {
			view.targets.delete(place.element);
			view.visible.delete(place.element);
			if (view.observer) view.observer.unobserve(place.element);
		}
	}
	if (usages.length > 0) {
		removable.delete(key);
		removed.set(key, { url: knownUrls.get(key) ?? key, usages: [...(removed.get(key)?.usages ?? []), ...usages] });
		queueViewReport();
		renderMarks();
	}
	return { removed: usages.length, styled };
}

// Removes the image from one place (see removeImage()): "element" — done in the element, "document" — the rules of the
// document are needed too; null — not removed (the element is gone, or a shadow root did not adopt the rules).
/** @type {Functions.ImageInfo.CollectFrame.removePlace} */
function removePlace({ element, usage, pseudo, property }) {
	if (!element.isConnected) return null;
	if (usage.kind === "poster") {
		element.removeAttribute("poster");
		return "element";
	}
	if (usage.kind === "svg" && element.localName !== "image") {
		element.removeAttribute("href");
		element.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
		return "element";
	}
	if (usage.kind !== "css") {
		element.remove();
		return "element";
	}
	if (!property) return null;
	if (!pseudo) {
		const style = /** @type {Partial<ElementCSSInlineStyle>} */ (element).style;
		if (!style) return null;
		for (const name of removedProperties(property)) style.setProperty(name, "none", "important");
		return "element";
	}
	const tokens = new Set((element.getAttribute(REMOVED_ATTRIBUTE) ?? "").split(/\s+/).filter(Boolean));
	tokens.add(`${pseudo}-${property}`);
	element.setAttribute(REMOVED_ATTRIBUTE, [...tokens].join(" "));
	const root = element.getRootNode();
	if (!(root instanceof ShadowRoot)) return "document";
	return adoptRemovedCss(root) ? "element" : null;
}

// REMOVED_CSS into an open shadow root (a constructed style sheet — the CSP of the page does not apply to it); false = the
// browser did not let the extension do it.
/** @type {Functions.ImageInfo.CollectFrame.adoptRemovedCss} */
function adoptRemovedCss(root) {
	if (removedRoots.has(root)) return true;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(REMOVED_CSS);
		root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
		removedRoots.add(root);
		return true;
	} catch {
		return false;
	}
}

// --- What of the images the user sees (see the comment at the beginning) ---

// The elements of the new listing. While the frame follows them, the visible ones that stay keep their state until the
// observer reports them again (no highlight blinks), and the image under the pointer is looked for again.
/** @type {Functions.ImageInfo.CollectFrame.setViewTargets} */
function setViewTargets(targets) {
	view.targets = targets;
	const observer = view.observer;
	if (!observer) return;
	for (const element of view.visible) if (!targets.has(element)) view.visible.delete(element);
	observer.disconnect();
	for (const element of targets.keys()) observer.observe(element);
	scheduleHover();
}

// The listing asks for the view of this document for leaseMs more (the background part runs it again every few seconds) —
// it gets the current state right away, the listing may be new. Nothing to follow — false.
/** @type {Functions.ImageInfo.CollectFrame.watchView} */
export function watchView({ leaseMs }) {
	const lease = Math.min(Math.max(Number(leaseMs) || 0, 0), VIEW_MAX_LEASE_MS);
	if (!lease || view.targets.size === 0) return false;
	if (view.leaseTimer) clearTimeout(view.leaseTimer);
	view.leaseTimer = setTimeout(() => stopView(true), lease);
	if (!view.observer) startView();
	view.sent = null;
	queueViewReport();
	return true;
}

/** @type {Functions.ImageInfo.CollectFrame.startView} */
function startView() {
	const observer = new IntersectionObserver(onViewIntersections);
	view.observer = observer;
	for (const element of view.targets.keys()) observer.observe(element);
	for (const type of VIEW_POINTER_EVENTS) document.addEventListener(type, onViewPointer, { capture: true, passive: true });
	document.addEventListener("scroll", onViewScroll, { capture: true, passive: true });
	addEventListener("pagehide", onViewPageHide);
}

// Stops following; report: the listing learns that nothing is highlighted any more (when something was).
/** @type {Functions.ImageInfo.CollectFrame.stopView} */
function stopView(report) {
	if (!view.observer) return;
	view.observer.disconnect();
	view.observer = null;
	for (const type of VIEW_POINTER_EVENTS) document.removeEventListener(type, onViewPointer, { capture: true });
	document.removeEventListener("scroll", onViewScroll, { capture: true });
	removeEventListener("pagehide", onViewPageHide);
	if (view.leaseTimer) clearTimeout(view.leaseTimer);
	if (view.reportTimer) clearTimeout(view.reportTimer);
	if (view.frame) cancelAnimationFrame(view.frame);
	const shown = view.sent !== null && view.sent !== JSON.stringify({ visible: [], hovered: [] });
	view.leaseTimer = null;
	view.reportTimer = null;
	view.frame = 0;
	view.visible.clear();
	view.hovered = null;
	view.pointer = null;
	view.sent = null;
	if (report && shown) postViewReport({ visible: [], hovered: [] });
}

// The document goes away (another page in the frame) — its images are not on the page any more.
/** @type {Functions.ImageInfo.CollectFrame.onViewPageHide} */
function onViewPageHide() {
	stopView(true);
}

// The observer counts an element in the viewport; viewState() decides when the report goes (its size and visibility can
// change without a crossing of the edge of the viewport).
/** @type {Functions.ImageInfo.CollectFrame.onViewIntersections} */
function onViewIntersections(entries) {
	for (const entry of entries) {
		if (entry.isIntersecting) view.visible.add(entry.target);
		else view.visible.delete(entry.target);
	}
	queueViewReport();
}

// The mouse (or a pen) where it is now, out of the document (into the browser, another window, a frame); a finger only by a
// tap — the image it tapped stays "under the pointer" until the next tap (the touch pointer goes away after every tap).
/** @type {Functions.ImageInfo.CollectFrame.onViewPointer} */
function onViewPointer(event) {
	if (event.pointerType === "touch") {
		if (event.type !== "pointerdown") return;
		view.pointer = { x: event.clientX, y: event.clientY, touch: true };
	} else if (event.type === "pointerout") {
		const into = /** @type {Element | null} */ (event.relatedTarget);
		if (into && !["iframe", "frame", "object", "embed"].includes(into.localName)) return;
		view.pointer = null;
	} else {
		view.pointer = { x: event.clientX, y: event.clientY, touch: false };
	}
	scheduleHover();
}

// Scrolling moves the page under the mouse that stays still.
/** @type {Functions.ImageInfo.CollectFrame.onViewScroll} */
function onViewScroll() {
	if (view.pointer && !view.pointer.touch) scheduleHover();
}

// The image under the pointer once in a frame of the animation (the pointer moves many times between them).
/** @type {Functions.ImageInfo.CollectFrame.scheduleHover} */
function scheduleHover() {
	if (view.frame || !view.observer) return;
	view.frame = requestAnimationFrame(() => {
		view.frame = 0;
		const hovered = view.pointer ? hoveredTarget(view.pointer.x, view.pointer.y) : null;
		if (hovered === view.hovered) return;
		view.hovered = hovered;
		queueViewReport();
	});
}

// The topmost element of the listing at the point, unless something of another part of the page covers it (see the comment
// at the beginning). A badge of the marks over the element does not cover it.
/** @type {Functions.ImageInfo.CollectFrame.hoveredTarget} */
function hoveredTarget(x, y) {
	const stack = pointStack(document, x, y, 0).filter((element) => element !== pageMarks.host);
	const index = stack.findIndex((element) => view.targets.has(element));
	if (index < 0) return null;
	const target = stack[index];
	for (const above of stack.slice(0, index)) {
		if (!composedContains(target, above) && !composedContains(above, target) && !sharesBox(above, target)) return null;
	}
	return target;
}

// The elements at the point from the top, the content of open shadow roots right above their hosts.
/** @type {Functions.ImageInfo.CollectFrame.pointStack} */
function pointStack(root, x, y, depth) {
	/** @type {Element[]} */
	const stack = [];
	for (const element of root.elementsFromPoint(x, y)) {
		// A shadow root also gives the elements outside it (retargeted) — those are in the stack around its host already.
		if (root !== document && element.getRootNode() !== root) continue;
		if (element.shadowRoot && depth < VIEW_MAX_SHADOW_DEPTH) stack.push(...pointStack(element.shadowRoot, x, y, depth + 1));
		stack.push(element);
	}
	return stack;
}

// The parent element, from the top of a shadow root its host.
/** @type {Functions.ImageInfo.CollectFrame.composedParent} */
function composedParent(node) {
	if (node.parentElement) return node.parentElement;
	const parent = node.parentNode;
	return parent instanceof ShadowRoot ? parent.host : null;
}

// Is node the element itself or inside it (also through shadow roots)?
/** @type {Functions.ImageInfo.CollectFrame.composedContains} */
function composedContains(element, node) {
	for (let current = /** @type {Element | null} */ (node); current; current = composedParent(current)) if (current === element) return true;
	return false;
}

// Are the two elements in the same box — is their nearest common ancestor something else than <body> and the root?
/** @type {Functions.ImageInfo.CollectFrame.sharesBox} */
function sharesBox(a, b) {
	for (let ancestor = composedParent(a); ancestor; ancestor = composedParent(ancestor)) {
		if (composedContains(ancestor, b)) return ancestor !== document.body && ancestor !== document.documentElement;
	}
	return false;
}

// The report in a moment (the changes of one scroll or one movement of the mouse together).
/** @type {Functions.ImageInfo.CollectFrame.queueViewReport} */
function queueViewReport() {
	if (view.reportTimer || !view.observer) return;
	view.reportTimer = setTimeout(() => {
		view.reportTimer = null;
		if (!view.observer) return;
		const state = viewState();
		const json = JSON.stringify(state);
		if (json === view.sent) return;
		view.sent = json;
		postViewReport(state);
	}, VIEW_REPORT_DELAY_MS);
}

// The keys of the visible images (an element in the viewport with a size, not hidden by visibility, opacity or
// content-visibility) and of the image under the pointer.
/** @type {Functions.ImageInfo.CollectFrame.viewState} */
function viewState() {
	/** @type {Set<string>} */
	const visible = new Set();
	for (const element of view.visible) {
		if (!element.isConnected) continue;
		const rect = element.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) continue;
		if (typeof element.checkVisibility === "function" && !element.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
		for (const key of view.targets.get(element) ?? []) visible.add(key);
	}
	const hovered = view.hovered && view.hovered.isConnected ? (view.targets.get(view.hovered) ?? []) : [];
	return { visible: [...visible], hovered: [...hovered] };
}

/** @type {Functions.ImageInfo.CollectFrame.postViewReport} */
function postViewReport(state) {
	try {
		const sent = chrome.runtime.sendMessage({ type: VIEW_REPORT_MESSAGE, ...state });
		if (sent && typeof sent.catch === "function") sent.catch(() => {});
	} catch {
		// The extension was reloaded or removed — this document has nobody to report to any more.
		stopView(false);
	}
}

// --- The marks of imageInfoSandbox on the page (see the comment at the beginning) ---

// The marks of the listing by the elements of the last listing: every element on the page with the marked images it shows
// (in the order of its keys), at most MARK_MAX_ELEMENTS of them.
/** @type {Functions.ImageInfo.CollectFrame.markGroups} */
export function markGroups(targets, images) {
	const groups = new Map();
	for (const [element, keys] of targets) {
		if (groups.size >= MARK_MAX_ELEMENTS) break;
		const found = keys.flatMap((key) => {
			const image = images.get(key);
			return image && image.marks.length > 0 ? [image] : [];
		});
		if (found.length > 0) groups.set(element, found);
	}
	return groups;
}

// The icons of a badge: of all marks of its images, each once, in their order.
/** @type {Functions.ImageInfo.CollectFrame.markIcons} */
export function markIcons(images) {
	return [...new Set(images.flatMap((image) => image.marks.map((mark) => mark.icon)))];
}

// The marks of the images of the last listing for leaseMs more (the background part sends them again every few seconds); an
// empty list or no lease takes them away. Returns how many elements have a badge.
/** @type {Functions.ImageInfo.CollectFrame.markImages} */
export function markImages({ images, leaseMs, source }) {
	const lease = Math.min(Math.max(Number(leaseMs) || 0, 0), VIEW_MAX_LEASE_MS);
	if (pageMarks.leaseTimer) clearTimeout(pageMarks.leaseTimer);
	pageMarks.leaseTimer = null;
	pageMarks.images = new Map((Array.isArray(images) ? images : []).map(({ key, name, marks }) => [key, { name, marks }]));
	pageMarks.source = typeof source === "string" ? source : "";
	if (!lease || pageMarks.images.size === 0) {
		clearMarks();
		return { marked: 0 };
	}
	pageMarks.leaseTimer = setTimeout(clearMarks, lease);
	return { marked: renderMarks() };
}

// The badges by the marks and the elements of the last listing (after new marks, a new listing, a removed image): a new element
// gets one, an element no longer marked loses its badge, a badge with other marks is built again. Without a marked element the
// element of the marks goes away (the marks stay for the next listing). Returns how many elements have a badge.
/** @type {Functions.ImageInfo.CollectFrame.renderMarks} */
function renderMarks() {
	if (pageMarks.images.size === 0) return 0;
	const groups = markGroups(view.targets, pageMarks.images);
	if (groups.size === 0) {
		stopMarkLayer();
		return 0;
	}
	const layer = markLayer();
	if (!layer) return 0;
	for (const [element, badge] of pageMarks.badges) {
		if (groups.has(element)) continue;
		if (pageMarks.tipFor === badge.element) hideMarkTip();
		badge.element.remove();
		pageMarks.badges.delete(element);
		pageMarks.visible.delete(element);
		pageMarks.observer?.unobserve(element);
		pageMarks.resizer?.unobserve(element);
	}
	for (const [element, images] of groups) {
		const json = JSON.stringify(images);
		const known = pageMarks.badges.get(element);
		if (known && known.json === json) continue;
		const badge = createBadge(images);
		if (known) {
			if (pageMarks.tipFor === known.element) hideMarkTip();
			known.element.replaceWith(badge);
		} else {
			layer.appendChild(badge);
			pageMarks.observer?.observe(element);
			pageMarks.resizer?.observe(element);
		}
		pageMarks.badges.set(element, { element: badge, json });
	}
	scheduleMarkPositions();
	return groups.size;
}

// The layer of the badges in the element of the marks (created once — again when the page removed it, with all badges); its
// observers and listeners start with it. null = the browser did not let the extension create it (not an HTML document).
/** @type {Functions.ImageInfo.CollectFrame.markLayer} */
function markLayer() {
	if (pageMarks.host && pageMarks.host.isConnected && pageMarks.layer) return pageMarks.layer;
	stopMarkLayer();
	try {
		const host = document.createElement(MARK_HOST_TAG);
		for (const [name, value] of MARK_HOST_STYLE) host.style.setProperty(name, value, "important");
		// Only a picture over the page — the listing is the accessible form of the same.
		host.setAttribute("aria-hidden", "true");
		const root = host.attachShadow({ mode: "closed" });
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(MARK_CSS);
			root.adoptedStyleSheets = [sheet];
		} catch {
			const style = document.createElement("style");
			style.textContent = MARK_CSS;
			root.appendChild(style);
		}
		const layer = document.createElement("div");
		layer.className = "layer";
		const tip = document.createElement("div");
		tip.className = "tip";
		layer.appendChild(tip);
		root.appendChild(layer);
		document.documentElement.appendChild(host);
		pageMarks.host = host;
		pageMarks.layer = layer;
		pageMarks.tip = tip;
	} catch {
		return null;
	}
	pageMarks.observer = new IntersectionObserver(onMarkIntersections);
	pageMarks.resizer = typeof ResizeObserver === "function" ? new ResizeObserver(() => scheduleMarkPositions()) : null;
	document.addEventListener("scroll", scheduleMarkPositions, { capture: true, passive: true });
	addEventListener("resize", scheduleMarkPositions, { passive: true });
	addEventListener("pagehide", clearMarks);
	pageMarks.positionTimer = setInterval(scheduleMarkPositions, MARK_POSITION_MS);
	return pageMarks.layer;
}

// Takes the marks away (the end of the lease, an empty list, the page goes away).
/** @type {Functions.ImageInfo.CollectFrame.clearMarks} */
function clearMarks() {
	if (pageMarks.leaseTimer) clearTimeout(pageMarks.leaseTimer);
	pageMarks.leaseTimer = null;
	pageMarks.images = new Map();
	stopMarkLayer();
}

// Removes the element of the marks with its badges, observers, listeners and timers.
/** @type {Functions.ImageInfo.CollectFrame.stopMarkLayer} */
function stopMarkLayer() {
	if (!pageMarks.host) return;
	pageMarks.observer?.disconnect();
	pageMarks.resizer?.disconnect();
	document.removeEventListener("scroll", scheduleMarkPositions, { capture: true });
	removeEventListener("resize", scheduleMarkPositions);
	removeEventListener("pagehide", clearMarks);
	if (pageMarks.positionTimer) clearInterval(pageMarks.positionTimer);
	if (pageMarks.frame) cancelAnimationFrame(pageMarks.frame);
	pageMarks.host.remove();
	pageMarks.host = null;
	pageMarks.layer = null;
	pageMarks.tip = null;
	pageMarks.tipFor = null;
	pageMarks.observer = null;
	pageMarks.resizer = null;
	pageMarks.positionTimer = null;
	pageMarks.frame = 0;
	pageMarks.badges.clear();
	pageMarks.visible.clear();
}

// The observer counts an element in the viewport (clipped by the frames and the scrolled boxes around it).
/** @type {Functions.ImageInfo.CollectFrame.onMarkIntersections} */
function onMarkIntersections(entries) {
	for (const entry of entries) {
		if (entry.isIntersecting) pageMarks.visible.add(entry.target);
		else pageMarks.visible.delete(entry.target);
	}
	scheduleMarkPositions();
}

// The badges follow their elements once in a frame of the animation (a scroll fires many times between them).
/** @type {Functions.ImageInfo.CollectFrame.scheduleMarkPositions} */
function scheduleMarkPositions() {
	if (pageMarks.frame || !pageMarks.layer) return;
	pageMarks.frame = requestAnimationFrame(() => {
		pageMarks.frame = 0;
		positionMarks();
	});
}

// Every badge at the top left corner of its element (relative to the element of the marks, wherever the page puts it), shown
// only while its element is visible (markedRect()); the badges of elements with the same corner go one after another. All
// reads of the layout come before the writes (one layout of the page, not one for every badge). The element of the marks
// removed by the page is created again.
/** @type {Functions.ImageInfo.CollectFrame.positionMarks} */
function positionMarks() {
	if (!pageMarks.host) return;
	if (!pageMarks.host.isConnected) {
		renderMarks();
		return;
	}
	const origin = pageMarks.host.getBoundingClientRect();
	const placed = [...pageMarks.badges].map(([element, badge]) => ({ badge: badge.element, rect: markedRect(element), x: 0, y: 0 }));
	for (const { badge, rect } of placed) {
		badge.classList.toggle("badge--shown", rect !== null);
		if (!rect && pageMarks.tipFor === badge) hideMarkTip();
	}
	/** @type {Map<string, { x: number; badge: HTMLElement }>} */
	const corners = new Map();
	for (const item of placed) {
		if (!item.rect) continue;
		const left = item.rect.left - origin.left + MARK_INSET;
		item.y = item.rect.top - origin.top + MARK_INSET;
		const corner = `${Math.round(left / 4)} ${Math.round(item.y / 4)}`;
		const before = corners.get(corner);
		item.x = before ? before.x + before.badge.offsetWidth + 2 : left;
		corners.set(corner, { x: item.x, badge: item.badge });
	}
	for (const { badge, rect, x, y } of placed) {
		if (!rect) continue;
		badge.style.left = `${Math.round(x)}px`;
		badge.style.top = `${Math.round(y)}px`;
	}
	if (pageMarks.tipFor) placeMarkTip(pageMarks.tipFor);
}

// The rectangle of a marked element in the viewport while it is visible — the observer counts it in the viewport, it has a
// size, it is not hidden by visibility, opacity or content-visibility and nothing of another part of the page covers its corner
// (markCovered()); otherwise null.
/** @type {Functions.ImageInfo.CollectFrame.markedRect} */
function markedRect(element) {
	if (!element.isConnected || !pageMarks.visible.has(element)) return null;
	const rect = element.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return null;
	if (typeof element.checkVisibility === "function" && !element.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return null;
	const x = Math.min(Math.max(rect.left + MARK_INSET, 0), innerWidth - 1);
	const y = Math.min(Math.max(rect.top + MARK_INSET, 0), innerHeight - 1);
	if (x >= rect.right || y >= rect.bottom) return rect;
	return markCovered(element, x, y) ? null : rect;
}

// Does something of another part of the page cover the element at the point (as for the image under the pointer, see
// hoveredTarget())? The badges do not count; an element the page made ignore the pointer cannot be told — not covered.
/** @type {Functions.ImageInfo.CollectFrame.markCovered} */
function markCovered(element, x, y) {
	const stack = pointStack(document, x, y, 0).filter((other) => other !== pageMarks.host);
	const index = stack.indexOf(element);
	if (index < 0) return false;
	return stack.slice(0, index).some((above) => !composedContains(element, above) && !composedContains(above, element) && !sharesBox(above, element));
}

// An element of the shadow root of the marks with a class and a text (always textContent — the texts come from the page and
// its images).
/** @type {Functions.ImageInfo.CollectFrame.markText} */
function markText(tag, className, text) {
	const element = document.createElement(tag);
	element.className = className;
	if (text) element.textContent = text;
	return element;
}

// A badge: the icons of the marks of the images of its element — the tip with the details under the mouse pointer, after a tap
// on a touch screen (another tap hides it).
/** @type {Functions.ImageInfo.CollectFrame.createBadge} */
function createBadge(images) {
	const badge = markText("div", "badge", markIcons(images).join(" "));
	badge.addEventListener("pointerenter", (event) => {
		if (event.pointerType !== "touch") showMarkTip(badge, images);
	});
	badge.addEventListener("pointerleave", (event) => {
		if (event.pointerType !== "touch" && pageMarks.tipFor === badge) hideMarkTip();
	});
	badge.addEventListener("pointerdown", (event) => {
		if (event.pointerType !== "touch") return;
		if (pageMarks.tipFor === badge) hideMarkTip();
		else showMarkTip(badge, images);
	});
	return badge;
}

// The tip of a badge: the module the marks are from, then for every image its file name and its marks — the icon, the name of
// the property and the details.
/** @type {Functions.ImageInfo.CollectFrame.showMarkTip} */
function showMarkTip(badge, images) {
	const tip = pageMarks.tip;
	if (!tip) return;
	tip.replaceChildren();
	if (pageMarks.source) tip.appendChild(markText("div", "tip__source", pageMarks.source));
	for (const image of images) {
		if (image.name) tip.appendChild(markText("div", "tip__name", image.name));
		for (const mark of image.marks) {
			const line = markText("div", "tip__line", "");
			const text = markText("span", "tip__text", "");
			text.appendChild(markText("span", "tip__label", mark.label));
			if (mark.detail) text.appendChild(markText("span", "tip__detail", mark.detail));
			line.append(markText("span", "tip__icon", mark.icon), text);
			tip.appendChild(line);
		}
	}
	pageMarks.tipFor = badge;
	tip.classList.add("tip--shown");
	placeMarkTip(badge);
}

// The tip under its badge — above it when there is no room below — and within the width of the viewport.
/** @type {Functions.ImageInfo.CollectFrame.placeMarkTip} */
function placeMarkTip(badge) {
	const { tip, host } = pageMarks;
	if (!tip || !host || !badge.isConnected || !badge.classList.contains("badge--shown")) {
		hideMarkTip();
		return;
	}
	const origin = host.getBoundingClientRect();
	const at = badge.getBoundingClientRect();
	const width = document.documentElement.clientWidth || innerWidth;
	const height = document.documentElement.clientHeight || innerHeight;
	const left = Math.max(4, Math.min(at.left, width - tip.offsetWidth - 4));
	const below = at.bottom + 4;
	const above = at.top - tip.offsetHeight - 4;
	const top = below + tip.offsetHeight <= height - 4 || above < 4 ? below : above;
	tip.style.left = `${Math.round(left - origin.left)}px`;
	tip.style.top = `${Math.round(top - origin.top)}px`;
}

/** @type {Functions.ImageInfo.CollectFrame.hideMarkTip} */
function hideMarkTip() {
	pageMarks.tipFor = null;
	pageMarks.tip?.classList.remove("tip--shown");
}
