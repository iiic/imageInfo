//@ts-check
"use strict";

// modules/imageInfo/background-script.mjs
// The background part of the imageInfo module (see registerBackgroundScript() in sdk.mjs):
//
// 1. Records the requests of images in all tabs while the pages load them (webRequest, not blocking): when a
//    request is sent its Accept header (onSendHeaders), its redirects (onBeforeRedirect), when it finishes the
//    status, all response headers, whether it came from the cache and the IP address of the server
//    (onCompleted), or the error (onErrorOccurred) — one record per address and tab (records.mjs); a redirected
//    request under the address the page asked for. Also the documents of tabs and frames that are images (an
//    image opened in the tab) — the listeners get all documents and keep only those with an image Content-Type. The records live in memory and in the
//    module's own IndexedDB (store.mjs, written a moment after the last change), so that they survive the
//    background part going to sleep; those of private windows only in memory. A closed tab takes its records
//    with it, a new session of the browser all of them (the tabs get their numbers again from the start).
//    The extension pages get UPDATED_MESSAGE ({ tabId }) a moment after new records of a tab.
//
// 2. In Firefox, with CAPTURE_KEY turned on, it also reads the responses of images while they load
//    (webRequest.filterResponseData(), also of a document that is an image): every piece of data goes to the
//    page right away, a copy of the first
//    CAPTURE_MAX_BYTES stays here, then the filter disconnects and the rest of the response flows straight to
//    the page. The metadata of the copy (metadata.mjs) goes into the record of the address — that is how the
//    listing gets the metadata of an image of another origin, which cannot be read from the cache later
//    (see collectFrame.mjs). Chrome has no such API. The blocking listener is registered only while the
//    setting is on — after the background page wakes up it comes a moment after the start (the setting is
//    read asynchronously), so the images of the first moment are not read.
//
// 3. At the request of an extension page (PAGE_MESSAGE, the core asks for imageInfoSandbox — imageInfo.getPage)
//    it lists the images of the page in the tab: in every frame (chrome.scripting.executeScript, allFrames) a
//    small function imports collectFrame.mjs into the isolated world of the extension and returns the usages
//    of the images, their Resource Timing and the metadata of the files the browser already has; page.mjs joins
//    them with the records of the tab. Without the page access the listing has only the records. In the icon_click mode
//    not on this request — see 10.
//
// 4. At the request of an extension page (FETCH_MESSAGE, the button "Load information" of imageInfoSandbox —
//    imageInfo.fetchImage) it downloads an image the last listing of the tab showed once more (fetch() of the background
//    part: no CORS and no Content-Security-Policy of the page in the way, an image of another origin too) and keeps its
//    headers (a new record, when there is none) and the metadata of the first CAPTURE_MAX_BYTES of it with the records of
//    the tab. Its own request has no tab — the listeners of the headers skip it.
//
// 5. At the request of an extension page (SAVE_MESSAGE, the button "Save" / "Download" of imageInfoSandbox —
//    imageInfo.saveImage) it gets the whole file of an image the last listing of the tab showed, for saving: first from
//    what the browser already has — in the frames that use it (readImageFile() of collectFrame.mjs: the HTTP cache of the
//    same origin, a data: or blob: address, never the network), otherwise it downloads it once more (fetch() of the
//    background part). Anonymously (the checkbox of the listing) both without cookies — credentials: "omit".
//
// 6. At the request of an extension page (READ_MESSAGE, the thumbnail of imageInfoSandbox — imageInfo.readImage) it gives
//    the whole file of an image the last listing of the tab showed: only from what the browser already has (as in 5.), or
//    with download — the button "Show" — downloaded once more like in 4. (its headers and metadata go to the records of the
//    tab too).
//
// 7. At the request of an extension page (WATCH_MESSAGE, the listener imageInfo.onView of imageInfoSandbox asks again every
//    few seconds) the frames of the last listing of the tab keep reporting for VIEW_LEASE_MS which of their images are visible
//    and which one is under the pointer (watchView() of collectFrame.mjs); their reports (VIEW_REPORT_MESSAGE) go on to the
//    extension pages with the tab and the frame (VIEW_MESSAGE) — Firefox does not deliver a message of a page to an extension
//    page in the same tab. The last report of every frame stays here for the floating window: Firefox delivers no message at
//    all to it (an extension page embedded in a tab), so it asks for them (VIEW_STATE_MESSAGE).
//
// 8. At the request of an extension page (REMOVE_MESSAGE, the button "Remove from the document" of imageInfoSandbox —
//    imageInfo.removeImage) it removes an image the last listing of the tab showed from the page: the frames that use it remove
//    it from their documents (removeImage() of collectFrame.mjs); a frame that turned off an image of ::before / ::after gets
//    the rules of REMOVED_CSS (chrome.scripting.insertCSS() with the "USER" origin — they win over the rules of the page).
//
// 9. At the request of an extension page (MARK_MESSAGE, the marks of the properties of images on the page of imageInfoSandbox —
//    imageInfo.markImages, sent again every few seconds while the listing is shown) the frames of the last listing of the tab
//    show a badge over the elements of the marked images for MARK_LEASE_MS (markImages() of collectFrame.mjs); the frames that
//    had badges and have no marks now lose them.
//
// 10. In the "On click of the main extension button" mode (ICON_CLICK_SPEC of module.mjs) the page is listed (3.) only at a
//    click on the extension button (api.activation.onIconClick() — the core tells the background parts before the extension
//    pages): the page in the active tab of the window of the click. The listing of the click (the reports of the frames, the
//    addresses of its images) stays in memory and in the store (store.mjs — not of a private window) until the next click in
//    the tab; PAGE_MESSAGE then gives that listing with the current records of its images (a listing asked for right after the
//    click waits for it), never lists the frames again — and once the tab has another page (another address without the
//    fragment, a document of the main frame after the click), none: the error "notClicked". The headers are recorded (1., 2.)
//    in this mode too — they cannot be had later. The buttons (4.–9.) work with the images of that listing.
//
// Without the webRequest permission chrome.webRequest does not exist when the background part starts — the
// listeners are then registered only after it is granted (permissions.onAdded). Firefox wakes a sleeping
// background page only for a listener registered at its start (see redirectCacheManager): it then records until
// it goes to sleep and permanently from the next start; the element says so (Status.persistent).
import { registerBackgroundScript, isWebPageUrl, executeScriptWithin, PAGE_ACCESS_PERMISSIONS, WEBREQUEST_PERMISSIONS } from "../../sdk.mjs";
import {
	MODULE_NAME,
	ACTIVATION_SPEC,
	DEFAULT_ACTIVATION_MODE,
	ICON_CLICK_SPEC,
	CAPTURE_PERMISSIONS,
	CAPTURE_MAX_BYTES,
	LIMITS,
	PAGE_MESSAGE,
	UPDATED_MESSAGE,
	STATUS_MESSAGE,
	FETCH_MESSAGE,
	FETCH_TIMEOUT_MS,
	SAVE_MESSAGE,
	SAVE_MAX_BYTES,
	READ_MESSAGE,
	REMOVE_MESSAGE,
	WATCH_MESSAGE,
	VIEW_MESSAGE,
	VIEW_STATE_MESSAGE,
	VIEW_LEASE_MS,
	MARK_MESSAGE,
	MARK_LEASE_MS,
	imageFileName,
	isFirefox,
	loadConfig,
} from "./module.mjs";
import { buildRecord, buildDownloadRecord, headerValue, upsertRecord, attachCapture, compactMetadata, isRecord, isImageDocument, MAX_REDIRECTS } from "./records.mjs";
import { buildPage } from "./page.mjs";
import { parseImageMetadata } from "./metadata.mjs";
import { toBase64, VIEW_REPORT_MESSAGE, REMOVED_CSS } from "./collectFrame.mjs";
import * as store from "./store.mjs";

// How long after the last change of a tab its records are written, and the pages told.
export const SAVE_DELAY_MS = 1000;
export const NOTIFY_DELAY_MS = 500;
// The most requests waiting for their end, and captured responses waiting for their record.
const MAX_PENDING_REQUESTS = 2000;
const MAX_PENDING_CAPTURES = 200;
// The marker of the browser session in api.sessionState (chrome.storage.session — the browser clears it at its
// start): without it the stored records are from an earlier session.
const SESSION_KEY = "session";

// The function the background part runs in every frame of the tab. executeScript passes only its source (no
// closure), so it imports collectFrame.mjs by the address written out here; the frame imports it into the
// isolated world of the extension (modules/* are web accessible). When the document of the frame goes away while
// the function still works (pagehide — a navigation; Firefox puts the page into the back-forward cache, frozen), it
// answers null right away: Firefox (verified in 159) otherwise settles executeScript() only once the user goes back to
// that page, or never — and the listing of imageInfoSandbox waited for it for good (every later listing waits for the
// one in progress).
/** @type {Functions.ImageInfo.BackgroundScript.runCollectFrame} */
export async function runCollectFrame(options) {
	const gone = new AbortController();
	/** @type {Promise<null>} */
	const left = new Promise((resolve) => addEventListener("pagehide", () => resolve(null), { once: true, signal: gone.signal }));
	const work = import(chrome.runtime.getURL("modules/imageInfo/collectFrame.mjs")).then((module) => /** @type {Types.ImageInfo.CollectFrameModule} */ (module).collectFrame(options));
	return Promise.race([work, left]).finally(() => gone.abort());
}

// The function that reads the whole file of an image in a frame for saving (the same way as runCollectFrame).
/** @type {Functions.ImageInfo.BackgroundScript.runReadImageFile} */
export async function runReadImageFile(options) {
	const gone = new AbortController();
	/** @type {Promise<null>} */
	const left = new Promise((resolve) => addEventListener("pagehide", () => resolve(null), { once: true, signal: gone.signal }));
	const work = import(chrome.runtime.getURL("modules/imageInfo/collectFrame.mjs")).then((module) => /** @type {Types.ImageInfo.CollectFrameModule} */ (module).readImageFile(options));
	return Promise.race([work, left]).finally(() => gone.abort());
}

// The function that keeps a frame reporting what of its images is visible and under the pointer (the same way as
// runCollectFrame).
/** @type {Functions.ImageInfo.BackgroundScript.runWatchView} */
export async function runWatchView(options) {
	const gone = new AbortController();
	/** @type {Promise<null>} */
	const left = new Promise((resolve) => addEventListener("pagehide", () => resolve(null), { once: true, signal: gone.signal }));
	const work = import(chrome.runtime.getURL("modules/imageInfo/collectFrame.mjs")).then((module) => /** @type {Types.ImageInfo.CollectFrameModule} */ (module).watchView(options));
	return Promise.race([work, left]).finally(() => gone.abort());
}

// The function that removes an image of the last listing from the document of a frame (the same way as runCollectFrame).
/** @type {Functions.ImageInfo.BackgroundScript.runRemoveImage} */
export async function runRemoveImage(options) {
	const gone = new AbortController();
	/** @type {Promise<null>} */
	const left = new Promise((resolve) => addEventListener("pagehide", () => resolve(null), { once: true, signal: gone.signal }));
	const work = import(chrome.runtime.getURL("modules/imageInfo/collectFrame.mjs")).then((module) => /** @type {Types.ImageInfo.CollectFrameModule} */ (module).removeImage(options));
	return Promise.race([work, left]).finally(() => gone.abort());
}

// The function that shows the marks of the images of the last listing on the page of a frame (the same way as runCollectFrame).
/** @type {Functions.ImageInfo.BackgroundScript.runMarkImages} */
export async function runMarkImages(options) {
	const gone = new AbortController();
	/** @type {Promise<null>} */
	const left = new Promise((resolve) => addEventListener("pagehide", () => resolve(null), { once: true, signal: gone.signal }));
	const work = import(chrome.runtime.getURL("modules/imageInfo/collectFrame.mjs")).then((module) => /** @type {Types.ImageInfo.CollectFrameModule} */ (module).markImages(options));
	return Promise.race([work, left]).finally(() => gone.abort());
}

// The longest wait for the frames of a tab (executeScriptWithin() of the core): a frame lists its images within
// LIMITS.totalTimeMs (a read of a file started just before that ends within LIMITS.fileTimeMs), plus a reserve for a
// slow page. A frame stuck without pagehide (see runCollectFrame) then cannot keep a listing, a saving or the marks
// waiting for good.
export const INJECTION_TIME_LIMIT_MS = LIMITS.totalTimeMs + LIMITS.fileTimeMs + 6000;

// The most image keys of one report of a frame (it follows at most the usages of one listing).
const MAX_VIEW_KEYS = LIMITS.maxUsages;

// The keys of the images of a report of a frame.
/** @type {Functions.ImageInfo.BackgroundScript.isViewKeys} */
function isViewKeys(value) {
	return Array.isArray(value) && value.length <= MAX_VIEW_KEYS && value.every((key) => typeof key === "string");
}

// The marks of images from an extension page (the core checked their limits — here only their shape): [{ url, name, marks:
// [{ icon, label, detail }] }], at most as many as the usages of one listing.
/** @type {Functions.ImageInfo.BackgroundScript.isMarkedImages} */
function isMarkedImages(value) {
	const isText = (/** @type {unknown} */ text) => typeof text === "string";
	return (
		Array.isArray(value) &&
		value.length <= MAX_VIEW_KEYS &&
		value.every(
			(image) =>
				image &&
				typeof image === "object" &&
				isText(image.url) &&
				isText(image.name) &&
				Array.isArray(image.marks) &&
				image.marks.every((/** @type {unknown} */ mark) => {
					const item = /** @type {Record<string, unknown> | null} */ (mark && typeof mark === "object" ? mark : null);
					return item !== null && isText(item.icon) && isText(item.label) && (item.detail === null || isText(item.detail));
				})
		)
	);
}

// The webRequest types of images the browser knows ("imageset" only in Firefox — Chrome rejects an unknown type).
/** @type {Functions.ImageInfo.BackgroundScript.imageTypes} */
function imageTypes() {
	const known = chrome.webRequest && chrome.webRequest.ResourceType ? Object.values(chrome.webRequest.ResourceType).map(String) : ["image"];
	return /** @type {Types.ImageInfo.RequestTypes} */ (/** @type {unknown} */ (["image", "imageset"].filter((type) => known.includes(type))));
}

// The types of documents — a document may be an image (an image opened in the tab or in a frame).
/** @type {Types.ImageInfo.RequestTypes} */
const DOCUMENT_TYPES = ["main_frame", "sub_frame"];

/** @type {Functions.ImageInfo.BackgroundScript.isDocumentType} */
function isDocumentType(type) {
	return type === "main_frame" || type === "sub_frame";
}

// The pieces of a captured response as one array.
/** @type {Functions.ImageInfo.BackgroundScript.concat} */
function concat(chunks, total) {
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk.subarray(0, total - offset), offset);
		offset += Math.min(chunk.length, total - offset);
	}
	return bytes;
}

registerBackgroundScript({
	name: MODULE_NAME,
	setup: ({ api }) => {
		const firefox = isFirefox();
		// The settings and the activity, loaded once (the listeners need them synchronously), discarded when the
		// settings, the module list or the permissions change.
		/** @type {Types.ImageInfo.ActiveConfig | null} */
		let config = null;
		/** @type {Promise<Types.ImageInfo.ActiveConfig> | null} */
		let configPromise = null;
		// When the listeners of the headers were registered: at the start of the background part, or later.
		/** @type {'startup' | 'runtime' | null} */
		let listenerState = null;
		/** @type {Map<number, Types.ImageInfo.TabState>} */
		const tabs = new Map();
		/** @type {Map<string, Types.ImageInfo.RequestNote>} */
		const requests = new Map();
		/** @type {Map<string, Types.ImageInfo.CaptureResult>} */
		const pendingCaptures = new Map();
		// When the last document of a tab came (the response of its main frame) — for the listing without frames.
		/** @type {Map<number, number>} */
		const documents = new Map();
		// The addresses of the images the last listing of a tab showed — only those may be downloaded again or saved — with
		// the frames that use them.
		/** @type {Map<number, Map<string, number[]>>} */
		const listed = new Map();
		// The last report of the view of every frame of a tab (only one with a visible image or one under the pointer).
		/** @type {Map<number, Map<number, Types.ImageInfo.ViewReport>>} */
		const views = new Map();
		// The frames of a tab that show badges of the marks (they lose them once the marks of the tab are empty).
		/** @type {Map<number, number[]>} */
		const marked = new Map();

		// A new session of the browser starts without the records of the previous one; otherwise only the
		// entries of tabs that no longer exist go. The tabs wait for it before they read their records.
		const sessionReady = (async () => {
			try {
				if (!(await api.sessionState.get(SESSION_KEY, false))) {
					await store.keepTabs(null);
					await api.sessionState.set(SESSION_KEY, true);
				} else if (chrome.tabs && chrome.tabs.query) {
					const open = await chrome.tabs.query({});
					await store.keepTabs(new Set(open.map((tab) => tab.id).filter((id) => typeof id === "number")));
				}
			} catch (err) {
				console.warn("imageInfo: uložené záznamy záložek nejde uklidit:", err);
			}
		})();

		/** @type {Functions.ImageInfo.BackgroundScript.getConfig} */
		function getConfig() {
			if (!configPromise) {
				configPromise = Promise.all([api.activation.isActive(DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC), api.settings.getMode(DEFAULT_ACTIVATION_MODE), loadConfig(api)]).then(
					([active, mode, settings]) => {
						// Without the records of the headers the captured metadata would have nowhere to go.
						config = { ...settings, active, clickOnly: active && ICON_CLICK_SPEC.isSatisfiedBy({ mode }), capture: settings.capture && settings.headers };
						syncCaptureListener();
						return config;
					},
					(err) => {
						configPromise = null;
						throw err;
					}
				);
			}
			return configPromise;
		}

		/** @type {Functions.ImageInfo.BackgroundScript.invalidateConfig} */
		function invalidateConfig() {
			configPromise = null;
			getConfig().catch((err) => console.error("imageInfo: nastavení nejde načíst:", err));
		}

		// --- The records of the tabs ---

		/** @type {Functions.ImageInfo.BackgroundScript.tabState} */
		function tabState(tabId) {
			let state = tabs.get(tabId);
			if (!state) {
				/** @type {Types.ImageInfo.TabState} */
				const created = { records: [], incognito: null, saveTimer: null, notifyTimer: null, ready: Promise.resolve() };
				created.ready = sessionReady
					.then(() => store.loadTab(tabId))
					.then((stored) => {
						// What came while reading wins over the stored records.
						let merged = stored.filter(isRecord);
						for (const record of created.records) merged = upsertRecord(merged, record);
						created.records = merged;
					})
					.catch((err) => console.warn("imageInfo: záznamy záložky nejde načíst:", err));
				tabs.set(tabId, created);
				state = created;
			}
			return state;
		}

		// A private window? Firefox says it in the report, Chrome in the tab.
		/** @type {Functions.ImageInfo.BackgroundScript.isIncognito} */
		async function isIncognito(tabId, state) {
			if (state.incognito !== null) return state.incognito;
			try {
				state.incognito = !!(await chrome.tabs.get(tabId)).incognito;
			} catch {
				// The tab is gone — nothing to write.
				state.incognito = true;
			}
			return state.incognito;
		}

		/** @type {Functions.ImageInfo.BackgroundScript.scheduleSave} */
		function scheduleSave(tabId) {
			const state = tabs.get(tabId);
			if (!state || state.saveTimer) return;
			state.saveTimer = setTimeout(async () => {
				state.saveTimer = null;
				await state.ready;
				if (tabs.get(tabId) !== state || (await isIncognito(tabId, state))) return;
				store.saveTab(tabId, state.records).catch((err) => console.warn("imageInfo: záznamy záložky nejde uložit:", err));
			}, SAVE_DELAY_MS);
		}

		/** @type {Functions.ImageInfo.BackgroundScript.scheduleNotify} */
		function scheduleNotify(tabId) {
			const state = tabs.get(tabId);
			if (!state || state.notifyTimer) return;
			state.notifyTimer = setTimeout(() => {
				state.notifyTimer = null;
				api.messages.send({ type: UPDATED_MESSAGE, tabId });
			}, NOTIFY_DELAY_MS);
		}

		/** @type {Functions.ImageInfo.BackgroundScript.record} */
		function record(details, request) {
			const state = tabState(details.tabId);
			if (typeof details.incognito === "boolean") state.incognito = details.incognito;
			let next = buildRecord(details, request);
			const captureKey = `${details.tabId} ${details.url}`;
			const capture = pendingCaptures.get(captureKey);
			if (capture) {
				pendingCaptures.delete(captureKey);
				next = { ...next, capture };
			}
			state.records = upsertRecord(state.records, next);
			scheduleSave(details.tabId);
			scheduleNotify(details.tabId);
		}

		// --- The listeners of the headers (not blocking) ---

		/** @type {Functions.ImageInfo.BackgroundScript.noteRequest} */
		function noteRequest(requestId, note) {
			requests.set(requestId, note);
			if (requests.size > MAX_PENDING_REQUESTS) {
				const oldest = requests.keys().next();
				if (!oldest.done) requests.delete(oldest.value);
			}
		}

		// The browser sends the headers again after every redirect (the same requestId) — the start and the redirects stay.
		/** @type {Functions.ImageInfo.BackgroundScript.onSendHeaders} */
		function onSendHeaders(details) {
			if (details.tabId < 0) return;
			const known = requests.get(details.requestId);
			noteRequest(details.requestId, {
				accept: headerValue(details.requestHeaders, "accept") ?? (known ? known.accept : null),
				startedAt: known ? known.startedAt : details.timeStamp,
				redirects: known ? known.redirects : [],
			});
		}

		/** @type {Functions.ImageInfo.BackgroundScript.onBeforeRedirect} */
		function onBeforeRedirect(details) {
			if (details.tabId < 0) return;
			const known = requests.get(details.requestId);
			/** @type {Types.ImageInfo.Redirect} */
			const hop = { url: details.url, statusCode: typeof details.statusCode === "number" ? details.statusCode : null, location: details.redirectUrl };
			const redirects = known ? known.redirects : [];
			noteRequest(details.requestId, {
				accept: known ? known.accept : null,
				startedAt: known ? known.startedAt : details.timeStamp,
				redirects: redirects.length < MAX_REDIRECTS ? [...redirects, hop] : redirects,
			});
		}

		// A finished or failed request — the decision waits for the settings only after the background part woke up. Of the
		// documents only those that are images; the main frame also notes the time of the document.
		/** @type {Functions.ImageInfo.BackgroundScript.onDone} */
		function onDone(details) {
			if (details.tabId < 0) return;
			const request = requests.get(details.requestId) ?? null;
			requests.delete(details.requestId);
			if (isDocumentType(details.type)) {
				if (details.type === "main_frame" && !("error" in details)) documents.set(details.tabId, Math.round(details.timeStamp));
				if (!isImageDocument(/** @type {Types.ImageInfo.RequestDetails} */ (details))) return;
			}
			const handle = (/** @type {Types.ImageInfo.ActiveConfig} */ current) => {
				if (current.active && current.headers) record(/** @type {Types.ImageInfo.RequestDetails} */ (details), request);
			};
			if (config) handle(config);
			else getConfig().then(handle, (err) => console.error("imageInfo: požadavek nejde zaznamenat:", err));
		}

		/** @type {Functions.ImageInfo.BackgroundScript.registerListeners} */
		function registerListeners(when) {
			const webRequest = chrome.webRequest;
			if (!webRequest || !webRequest.onCompleted) return;
			const urls = ["<all_urls>"];
			const types = [...imageTypes(), ...DOCUMENT_TYPES];
			try {
				if (!webRequest.onSendHeaders.hasListener(onSendHeaders)) webRequest.onSendHeaders.addListener(onSendHeaders, { urls, types }, ["requestHeaders"]);
				if (!webRequest.onCompleted.hasListener(onDone)) {
					webRequest.onCompleted.addListener(onDone, { urls, types }, ["responseHeaders"]);
					listenerState ??= when;
				}
				if (!webRequest.onErrorOccurred.hasListener(onDone)) webRequest.onErrorOccurred.addListener(onDone, { urls, types });
				// The last one — without it the records are only without the redirects.
				if (webRequest.onBeforeRedirect && !webRequest.onBeforeRedirect.hasListener(onBeforeRedirect)) webRequest.onBeforeRedirect.addListener(onBeforeRedirect, { urls, types });
			} catch (err) {
				console.error("imageInfo: posluchače webRequest nejde zaregistrovat:", err);
			}
		}

		/** @type {Functions.ImageInfo.BackgroundScript.isListening} */
		function isListening() {
			try {
				return !!(chrome.webRequest && chrome.webRequest.onCompleted && chrome.webRequest.onCompleted.hasListener(onDone));
			} catch {
				return false;
			}
		}

		// --- Reading the responses while they load (Firefox) ---

		/** @type {Functions.ImageInfo.BackgroundScript.webRequestWithFilter} */
		function webRequestWithFilter() {
			const webRequest = /** @type {Types.ImageInfo.WebRequestWithFilter | undefined} */ (/** @type {unknown} */ (chrome.webRequest));
			return webRequest && typeof webRequest.filterResponseData === "function" && webRequest.onHeadersReceived ? webRequest : null;
		}

		// The metadata of a captured response into the record of its address (or until the record comes).
		/** @type {Functions.ImageInfo.BackgroundScript.applyCapture} */
		function applyCapture(tabId, url, capture) {
			const state = tabState(tabId);
			const next = attachCapture(state.records, url, capture);
			if (next) {
				state.records = next;
				scheduleSave(tabId);
				scheduleNotify(tabId);
				return;
			}
			pendingCaptures.set(`${tabId} ${url}`, capture);
			if (pendingCaptures.size > MAX_PENDING_CAPTURES) {
				const oldest = pendingCaptures.keys().next();
				if (!oldest.done) pendingCaptures.delete(oldest.value);
			}
		}

		/** @type {Functions.ImageInfo.BackgroundScript.startCapture} */
		function startCapture(webRequest, details, current) {
			/** @type {Types.ImageInfo.StreamFilter} */
			let filter;
			try {
				filter = webRequest.filterResponseData(details.requestId);
			} catch {
				return;
			}
			/** @type {Uint8Array[]} */
			const chunks = [];
			let total = 0;
			let done = false;
			const finish = (/** @type {boolean} */ complete, /** @type {string | null} */ error) => {
				if (done) return;
				done = true;
				const bytes = concat(chunks, total);
				chunks.length = 0;
				(error ? Promise.resolve(null) : parseImageMetadata(bytes, { complete, ...current.metadata }))
					.then(
						(metadata) => ({ metadata: metadata ? compactMetadata(metadata, current.maxStoredChars) : null, bytes: total, complete, error, at: Date.now() }),
						(err) => ({ metadata: null, bytes: total, complete, error: err instanceof Error ? err.message : String(err), at: Date.now() })
					)
					.then((capture) => applyCapture(details.tabId, details.url, capture));
			};
			filter.ondata = (event) => {
				// The copy first — write() may hand the buffer over to the page.
				if (!done) {
					const copy = new Uint8Array(event.data.slice(0, CAPTURE_MAX_BYTES - total));
					chunks.push(copy);
					total += copy.length;
				}
				filter.write(event.data);
				if (!done && total >= CAPTURE_MAX_BYTES) {
					finish(false, null);
					try {
						filter.disconnect();
					} catch {
						// The response has ended in the meantime.
					}
				}
			};
			filter.onstop = () => {
				try {
					filter.close();
				} catch {
					// The page has left in the meantime.
				}
				finish(true, null);
			};
			filter.onerror = () => finish(false, filter.error || "filter error");
		}

		// The blocking listener only reads (it never changes or blocks a request): the filter of the response needs it.
		/** @type {Functions.ImageInfo.BackgroundScript.onCaptureHeaders} */
		function onCaptureHeaders(details) {
			const webRequest = webRequestWithFilter();
			const current = config;
			if (!webRequest || !current || !current.active || !current.capture || details.tabId < 0) return undefined;
			const status = details.statusCode;
			if (status < 200 || status >= 300 || status === 204 || details.method === "HEAD") return undefined;
			if (isDocumentType(details.type) && !isImageDocument(details)) return undefined;
			startCapture(webRequest, details, current);
			return undefined;
		}

		// The capture listener is registered while the settings want it and removed otherwise.
		/** @type {Functions.ImageInfo.BackgroundScript.syncCaptureListener} */
		function syncCaptureListener() {
			const webRequest = webRequestWithFilter();
			if (!firefox || !webRequest) return;
			const wanted = !!(config && config.active && config.capture);
			try {
				const has = webRequest.onHeadersReceived.hasListener(onCaptureHeaders);
				if (wanted && !has) webRequest.onHeadersReceived.addListener(onCaptureHeaders, { urls: ["<all_urls>"], types: [...imageTypes(), ...DOCUMENT_TYPES] }, ["blocking", "responseHeaders"]);
				else if (!wanted && has) webRequest.onHeadersReceived.removeListener(onCaptureHeaders);
			} catch (err) {
				// Without webRequestBlocking the browser rejects a blocking listener.
				console.warn("imageInfo: posluchač čtení odpovědí nejde zaregistrovat:", err);
			}
		}

		/** @type {Functions.ImageInfo.BackgroundScript.isCaptureListening} */
		function isCaptureListening() {
			try {
				const webRequest = webRequestWithFilter();
				return !!(webRequest && webRequest.onHeadersReceived.hasListener(onCaptureHeaders));
			} catch {
				return false;
			}
		}

		// --- The status and the listing ---

		/** @type {Functions.ImageInfo.BackgroundScript.contains} */
		function contains(set) {
			return api.permissions.contains(set).catch(() => false);
		}

		/** @type {Functions.ImageInfo.BackgroundScript.getStatus} */
		async function getStatus() {
			const current = await getConfig();
			const [webRequestGranted, pageAccess, captureGranted] = await Promise.all([
				contains(WEBREQUEST_PERMISSIONS),
				contains(PAGE_ACCESS_PERMISSIONS),
				firefox ? contains(CAPTURE_PERMISSIONS) : Promise.resolve(false),
			]);
			return {
				browser: firefox ? "firefox" : "chrome",
				headers: !current.headers ? "off" : webRequestGranted ? "on" : "noPermission",
				listening: isListening(),
				// Chrome always remembers the listener, Firefox only one registered at the start.
				persistent: listenerState === "startup" || !firefox,
				pageAccess: pageAccess && !!chrome.scripting,
				capture: !firefox ? "unsupported" : !current.capture ? "off" : captureGranted ? "on" : "noPermission",
				captureListening: isCaptureListening(),
				clickOnly: current.clickOnly,
			};
		}

		// The listing for an extension page (PAGE_MESSAGE): the frames of the page right now, in the icon_click mode the
		// listing of the last click (see 10. at the beginning).
		/** @type {Functions.ImageInfo.BackgroundScript.pageFor} */
		async function pageFor(tabId) {
			const current = await getConfig();
			return current.clickOnly ? clickedPage(tabId) : collectPage(tabId);
		}

		/** @type {Functions.ImageInfo.BackgroundScript.collectPage} */
		async function collectPage(tabId) {
			const status = await getStatus();
			const state = tabState(tabId);
			await state.ready;
			const records = state.records;
			return pageOf(await listTab(tabId, records, status), records, status);
		}

		// The listing as the extension pages get it: the records of the tab joined — only for a web page, whose images are then
		// remembered for the buttons (remember()).
		/** @type {Functions.ImageInfo.BackgroundScript.pageOf} */
		function pageOf(listing, records, status) {
			const { withRecords, ...input } = listing;
			const page = buildPage({ ...input, records: withRecords ? records : [], status });
			return withRecords ? remember(page) : page;
		}

		// What the frames of the page in the tab found (see 3. at the beginning) — the input of buildPage() without the records and
		// the status; withRecords: false without the tab or for a page that is not a web page (no records then).
		/** @type {Functions.ImageInfo.BackgroundScript.listTab} */
		async function listTab(tabId, records, status) {
			const collectedAt = Date.now();
			/** @type {chrome.tabs.Tab} */
			let tab;
			try {
				tab = await chrome.tabs.get(tabId);
			} catch {
				return { tab: null, frames: [], collectedAt, error: "noTab", withRecords: false };
			}
			const base = { tab: { tabId, url: tab.url ?? null, title: tab.title ?? null }, collectedAt, documentAt: documents.get(tabId) ?? null };
			if (tab.url && !isWebPageUrl(tab.url)) return { ...base, frames: [], error: "notWebPage", withRecords: false };
			if (!status.pageAccess) return { ...base, frames: [], error: "noAccess", withRecords: true };
			/** @type {Record<string, string>} */
			const accepts = {};
			for (const item of records) if (item.accept) accepts[item.url] = item.accept;
			const captured = records.filter((item) => item.capture && item.capture.metadata && item.capture.complete).map((item) => item.url);
			// Where the redirected images led — a file of another origin cannot be read from the cache.
			/** @type {Record<string, string>} */
			const finals = {};
			for (const item of records) if (item.finalUrl) finals[item.url] = item.finalUrl;
			// The limits of the metadata the frames read (the settings, see METADATA_LIMITS of module.mjs).
			const { metadata } = await getConfig();
			/** @type {chrome.scripting.InjectionResult<Awaited<ReturnType<typeof runCollectFrame>>>[]} */
			let injections;
			try {
				injections = await executeScriptWithin({ target: { tabId, allFrames: true }, func: runCollectFrame, args: [{ limits: LIMITS, metadata, accepts, captured, finals }] }, INJECTION_TIME_LIMIT_MS);
			} catch (err) {
				return { ...base, frames: [], error: "inject", errorDetail: err instanceof Error ? err.message : String(err), withRecords: true };
			}
			const extensionOrigin = chrome.runtime.getURL("");
			/** @type {Types.ImageInfo.FrameResult[]} */
			const frames = [];
			for (const injection of injections || []) {
				const report = injection && injection.result;
				// The frames of the extension itself (the floating window and its sandbox frames) are not the page.
				if (!report || typeof report !== "object" || !Array.isArray(report.usages) || String(report.url).startsWith(extensionOrigin)) continue;
				frames.push({ frameId: injection.frameId, report });
			}
			if (!frames.some((frame) => frame.frameId === 0)) {
				const failed = (injections || []).find((injection) => injection && injection.frameId === 0);
				const detail = failed && /** @type {{ error?: unknown }} */ (failed).error;
				return { ...base, frames, error: "inject", errorDetail: detail ? String(detail) : null, withRecords: true };
			}
			return { ...base, frames, withRecords: true };
		}

		// --- The icon_click mode: the listing of a click on the extension button (see 10. at the beginning) ---

		// The listing of the last click of a tab: a promise while the frames of the click still work; null — none.
		/** @type {Map<number, Promise<Types.ImageInfo.ClickListing | null>>} */
		const clicks = new Map();

		// A stored listing of a click in the expected shape (the store gives unchecked values).
		/** @type {Functions.ImageInfo.BackgroundScript.isClickListing} */
		function isClickListing(value) {
			const item = /** @type {Record<string, unknown> | null} */ (value && typeof value === "object" ? value : null);
			const tab = /** @type {Record<string, unknown> | null} */ (item && item.tab && typeof item.tab === "object" ? item.tab : null);
			return !!item && !!tab && typeof tab.tabId === "number" && Array.isArray(item.frames) && Array.isArray(item.urls) && typeof item.collectedAt === "number";
		}

		// The listing of the last click of the tab — from memory, otherwise as stored (the background part went to sleep since then).
		/** @type {Functions.ImageInfo.BackgroundScript.clickListing} */
		function clickListing(tabId) {
			let entry = clicks.get(tabId);
			if (!entry) {
				entry = sessionReady
					.then(() => store.loadClick(tabId))
					.then((value) => (isClickListing(value) ? value : null))
					.catch((err) => {
						console.warn("imageInfo: uložený výpis kliknutí nejde načíst:", err);
						return null;
					});
				clicks.set(tabId, entry);
			}
			return entry;
		}

		// A click on the extension button: in the icon_click mode the page in the active tab of the window of the click is listed
		// now. Registered right away, synchronously — a listing an extension page asks for right after the click waits for it.
		/** @type {Functions.ImageInfo.BackgroundScript.onIconClick} */
		function onIconClick(click) {
			const tabId = click.tabId;
			if (tabId === null || (config !== null && !config.clickOnly)) return;
			const previous = clickListing(tabId);
			const next = getConfig()
				.then((current) => (current.clickOnly ? listAtClick(tabId) : previous))
				.catch((err) => {
					console.error("imageInfo: stránku nejde vypsat po kliknutí na tlačítko rozšíření:", err);
					return previous;
				});
			clicks.set(tabId, next);
		}

		// The listing of a click: kept in memory and (not of a private window) in the store, the extension pages told
		// (UPDATED_MESSAGE — a listing that follows the tab asks again). None for a page that is not a web page.
		/** @type {Functions.ImageInfo.BackgroundScript.listAtClick} */
		async function listAtClick(tabId) {
			const status = await getStatus();
			const state = tabState(tabId);
			await state.ready;
			const listing = await listTab(tabId, state.records, status);
			if (!listing.withRecords || !listing.tab) return null;
			const page = pageOf(listing, state.records, status);
			/** @type {Types.ImageInfo.ClickListing} */
			const result = { ...listing, tab: listing.tab, urls: page.images.map((image) => image.url) };
			if (!(await isIncognito(tabId, state))) store.saveClick(tabId, result).catch((err) => console.warn("imageInfo: výpis kliknutí nejde uložit:", err));
			api.messages.send({ type: UPDATED_MESSAGE, tabId });
			return result;
		}

		// Is the listing of the click still of the page the tab has: the same address without the fragment (when the browser
		// tells it) and no document of the main frame since the click.
		/** @type {Functions.ImageInfo.BackgroundScript.isClickedPage} */
		function isClickedPage(listing, url, documentAt) {
			const bare = (/** @type {string} */ value) => value.split("#")[0];
			if (url !== null && listing.tab.url !== null && bare(url) !== bare(listing.tab.url)) return false;
			return documentAt === null || documentAt <= listing.collectedAt;
		}

		// The listing for an extension page in the icon_click mode: the listing of the last click of the tab with the current
		// records of its images (only those — no image the page loaded after the click) and the current status; the frames are
		// never asked again. Without one, or with one of another page than the tab has now — the error "notClicked" (without
		// the page access "noAccess": a click would not help).
		/** @type {Functions.ImageInfo.BackgroundScript.clickedPage} */
		async function clickedPage(tabId) {
			const status = await getStatus();
			const state = tabState(tabId);
			await state.ready;
			/** @type {chrome.tabs.Tab} */
			let tab;
			try {
				tab = await chrome.tabs.get(tabId);
			} catch {
				return buildPage({ tab: null, frames: [], records: [], status, collectedAt: Date.now(), error: "noTab" });
			}
			const current = { tabId, url: tab.url ?? null, title: tab.title ?? null };
			if (tab.url && !isWebPageUrl(tab.url)) return buildPage({ tab: current, frames: [], records: [], status, collectedAt: Date.now(), error: "notWebPage" });
			const listing = await clickListing(tabId);
			if (!listing || !isClickedPage(listing, current.url, documents.get(tabId) ?? null)) {
				return remember(buildPage({ tab: current, frames: [], records: [], status, collectedAt: Date.now(), error: status.pageAccess ? "notClicked" : "noAccess" }));
			}
			const urls = new Set(listing.urls);
			const records = state.records.filter((item) => urls.has(item.url) || (!!item.finalUrl && urls.has(item.finalUrl)));
			const { withRecords: _withRecords, urls: _urls, ...input } = listing;
			return remember(buildPage({ ...input, records, status }));
		}

		// The addresses of the images of the listing of the tab (see listed).
		/** @type {Functions.ImageInfo.BackgroundScript.remember} */
		function remember(page) {
			if (page.tab) {
				const frames = (/** @type {Types.ImageInfo.ImageEntry} */ image) => [...new Set(image.usages.map((usage) => usage.frameId).filter((id) => typeof id === "number"))];
				listed.set(page.tab.tabId, new Map(page.images.map((image) => [image.url, /** @type {number[]} */ (frames(image))])));
			}
			return page;
		}

		// The whole file of an image for saving (see 5. at the beginning): the frames that use it (all of them for an image no
		// element uses), the first one that has it wins; otherwise an http(s) address is downloaded once more.
		/** @type {Functions.ImageInfo.BackgroundScript.saveImage} */
		async function saveImage(tabId, url, anonymous, frameIds) {
			const state = tabState(tabId);
			await state.ready;
			const accept = state.records.find((item) => item.url === url)?.accept ?? null;
			const read = await readFromFrames(tabId, url, anonymous, frameIds, accept);
			if ("data" in read) return { data: read.data, contentType: read.contentType, fileName: imageFileName(url, read.contentType), source: "browser" };
			if (read.error === "tooLarge") throw new Error("tooLarge");
			if (!/^https?:/i.test(url)) throw new Error("unavailable");
			const response = await fetch(url, {
				credentials: anonymous ? "omit" : "include",
				cache: "no-store",
				redirect: "follow",
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				...(accept ? { headers: { Accept: accept } } : {}),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const length = Number(response.headers.get("content-length"));
			if (length > SAVE_MAX_BYTES) {
				await response.body?.cancel().catch(() => {});
				throw new Error("tooLarge");
			}
			/** @type {Uint8Array[]} */
			const chunks = [];
			let total = 0;
			if (response.body) {
				const reader = response.body.getReader();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
					total += value.length;
					if (total > SAVE_MAX_BYTES) {
						await reader.cancel().catch(() => {});
						throw new Error("tooLarge");
					}
				}
			}
			const contentType = response.headers.get("content-type");
			return { data: toBase64(concat(chunks, total)), contentType, fileName: imageFileName(response.url || url, contentType), source: "network" };
		}

		// The whole file of an image from what the browser already has — in the frames that use it (all of them for an image no
		// element uses), the first one that has it wins; never the network. Otherwise why not (the first reason of a frame).
		/** @type {Functions.ImageInfo.BackgroundScript.readFromFrames} */
		async function readFromFrames(tabId, url, anonymous, frameIds, accept) {
			if (!chrome.scripting || !chrome.scripting.executeScript) return { error: "unavailable" };
			/** @type {chrome.scripting.InjectionResult<Awaited<ReturnType<typeof runReadImageFile>>>[]} */
			let injections = [];
			try {
				injections = await executeScriptWithin(
					{
						target: frameIds.length ? { tabId, frameIds } : { tabId, allFrames: true },
						func: runReadImageFile,
						args: [{ key: url, accept, anonymous, maxBytes: SAVE_MAX_BYTES }],
					},
					INJECTION_TIME_LIMIT_MS
				);
			} catch {
				// No page access, or the frames are gone.
				return { error: "unavailable" };
			}
			const results = [...(injections || [])].sort((a, b) => a.frameId - b.frameId).map((injection) => injection && injection.result);
			for (const result of results) {
				if (result && typeof result === "object" && "data" in result && typeof result.data === "string") return result;
			}
			if (results.some((result) => result && typeof result === "object" && "error" in result && result.error === "tooLarge")) return { error: "tooLarge" };
			const first = results.find((result) => result && typeof result === "object" && "error" in result);
			return first && "error" in first ? first : { error: "unavailable" };
		}

		// The whole file of an image for the thumbnail (see 6. at the beginning).
		/** @type {Functions.ImageInfo.BackgroundScript.readImage} */
		async function readImage(tabId, url, anonymous, download, frameIds) {
			if (!download) {
				const state = tabState(tabId);
				await state.ready;
				const read = await readFromFrames(tabId, url, anonymous, frameIds, state.records.find((item) => item.url === url)?.accept ?? null);
				if ("data" in read) return { data: read.data, contentType: read.contentType, source: "browser" };
				throw new Error(read.error);
			}
			if (!/^https?:/i.test(url)) throw new Error("unavailable");
			const file = await fetchImage(tabId, url, anonymous, SAVE_MAX_BYTES);
			if (!file.ok) throw new Error(`HTTP ${file.status}`);
			if (!file.complete) throw new Error("tooLarge");
			return { data: toBase64(file.bytes), contentType: file.contentType, source: "network" };
		}

		// The image once more (see 4. at the beginning): the headers into a new record when the tab has none for the address
		// (the record of the load of the page stays), the metadata of the beginning of the file into the record. Anonymously
		// (the checkbox "Anonymously" of the listing) without cookies and HTTP authentication — credentials: "omit".
		/** @type {Functions.ImageInfo.BackgroundScript.fetchImage} */
		async function fetchImage(tabId, url, anonymous = false, maxBytes = CAPTURE_MAX_BYTES) {
			const state = tabState(tabId);
			await state.ready;
			const known = state.records.find((item) => item.url === url) ?? null;
			const accept = known ? known.accept : null;
			const startedAt = Date.now();
			const response = await fetch(url, {
				credentials: anonymous ? "omit" : "include",
				cache: "no-store",
				redirect: "follow",
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				...(accept ? { headers: { Accept: accept } } : {}),
			});
			/** @type {Uint8Array[]} */
			const chunks = [];
			let total = 0;
			let complete = true;
			if (response.body) {
				const reader = response.body.getReader();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
					total += value.length;
					if (total >= maxBytes) {
						complete = false;
						await reader.cancel().catch(() => {});
						break;
					}
				}
			}
			const bytes = concat(chunks, Math.min(total, maxBytes));
			const current = await getConfig();
			const metadata = response.ok && bytes.length ? await parseImageMetadata(bytes, { complete, ...current.metadata }) : null;
			/** @type {Types.ImageInfo.CaptureResult} */
			const capture = {
				metadata: metadata ? compactMetadata(metadata, current.maxStoredChars) : null,
				bytes: bytes.length,
				complete,
				error: metadata ? null : `HTTP ${response.status}`,
				at: Date.now(),
				download: true,
			};
			const next = known
				? attachCapture(state.records, url, capture)
				: upsertRecord(state.records, {
						...buildDownloadRecord(
							url,
							{ status: response.status, statusText: response.statusText, redirected: response.redirected, url: response.url, headers: [...response.headers] },
							accept,
							startedAt,
							Date.now()
						),
						capture,
					});
			if (next) state.records = next;
			scheduleSave(tabId);
			scheduleNotify(tabId);
			return { ok: response.ok, status: response.status, bytes, complete, contentType: response.headers.get("content-type") };
		}

		// Removes an image of the listing from the page (see 8. at the beginning) — all frames when a frame of the listing is gone
		// (the others do not know the image and remove nothing).
		/** @type {Functions.ImageInfo.BackgroundScript.removeImage} */
		async function removeImage(tabId, url, frameIds) {
			if (frameIds.length === 0) return { removed: 0 };
			if (!chrome.scripting || !chrome.scripting.executeScript) throw new Error("unavailable");
			const args = /** @type {[Types.ImageInfo.RemoveOptions]} */ ([{ key: url }]);
			/** @type {chrome.scripting.InjectionResult<Awaited<ReturnType<typeof runRemoveImage>>>[]} */
			let injections;
			try {
				injections = await executeScriptWithin({ target: { tabId, frameIds }, func: runRemoveImage, args }, INJECTION_TIME_LIMIT_MS);
			} catch {
				injections = await executeScriptWithin({ target: { tabId, allFrames: true }, func: runRemoveImage, args }, INJECTION_TIME_LIMIT_MS);
			}
			let removed = 0;
			/** @type {number[]} */
			const styled = [];
			for (const injection of injections || []) {
				const result = injection && injection.result;
				if (!result || typeof result !== "object" || typeof result.removed !== "number") continue;
				removed += result.removed;
				if (result.styled) styled.push(injection.frameId);
			}
			if (styled.length > 0 && chrome.scripting.insertCSS) await chrome.scripting.insertCSS({ target: { tabId, frameIds: styled }, css: REMOVED_CSS, origin: "USER" });
			return { removed };
		}

		// The frames of the last listing of the tab keep reporting their view (see 7. at the beginning) — all frames when the
		// background part does not know the listing (it went to sleep since then) or a frame of it is gone; only the frames
		// whose document the listing went through follow anything.
		/** @type {Functions.ImageInfo.BackgroundScript.watchView} */
		async function watchView(tabId) {
			const current = await getConfig();
			if (!current.active || !chrome.scripting || !chrome.scripting.executeScript) return;
			const images = listed.get(tabId);
			const frameIds = images ? [...new Set([...images.values()].flat())] : null;
			if (frameIds && frameIds.length === 0) return;
			const args = /** @type {[Types.ImageInfo.WatchOptions]} */ ([{ leaseMs: VIEW_LEASE_MS }]);
			if (frameIds) {
				try {
					await executeScriptWithin({ target: { tabId, frameIds }, func: runWatchView, args }, INJECTION_TIME_LIMIT_MS);
					return;
				} catch {
					// A frame of the listing is gone — all of them.
				}
			}
			await executeScriptWithin({ target: { tabId, allFrames: true }, func: runWatchView, args }, INJECTION_TIME_LIMIT_MS);
		}

		// The marks of the images on the page (see 9. at the beginning): the frames of the last listing of the tab and the frames
		// with badges get the marks of the images the listing showed (a frame marks only the elements of its own last listing);
		// all frames when the background part does not know the listing (it went to sleep since then) or a frame of it is gone.
		/** @type {Functions.ImageInfo.BackgroundScript.markImages} */
		async function markImages(tabId, images, source) {
			if (!chrome.scripting || !chrome.scripting.executeScript) throw new Error("unavailable");
			const listing = listed.get(tabId);
			const frameIds = listing ? [...new Set([...[...listing.values()].flat(), ...(marked.get(tabId) ?? [])])] : null;
			const shown = listing ? images.filter((image) => listing.has(image.url)) : images;
			const args = /** @type {[Types.ImageInfo.MarkOptions]} */ ([{ images: shown.map(({ url, name, marks }) => ({ key: url, name, marks })), leaseMs: MARK_LEASE_MS, source }]);
			/** @type {chrome.scripting.InjectionResult<Awaited<ReturnType<typeof runMarkImages>>>[] | null} */
			let injections = null;
			if (frameIds) {
				if (frameIds.length === 0) return { marked: 0 };
				try {
					injections = await executeScriptWithin({ target: { tabId, frameIds }, func: runMarkImages, args }, INJECTION_TIME_LIMIT_MS);
				} catch {
					// A frame of the listing is gone — all of them.
				}
			}
			injections ??= await executeScriptWithin({ target: { tabId, allFrames: true }, func: runMarkImages, args }, INJECTION_TIME_LIMIT_MS);
			let count = 0;
			/** @type {number[]} */
			const frames = [];
			for (const injection of injections || []) {
				const result = injection && injection.result;
				if (!result || typeof result !== "object" || typeof result.marked !== "number") continue;
				count += result.marked;
				if (result.marked > 0) frames.push(injection.frameId);
			}
			if (frames.length > 0) marked.set(tabId, frames);
			else marked.delete(tabId);
			return { marked: count };
		}

		// Only the extension pages may ask — the listing has the headers and addresses of all images of the tab.
		/** @type {Functions.ImageInfo.BackgroundScript.isExtensionPage} */
		const isExtensionPage = (sender) => sender.id === chrome.runtime.id && typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));

		// Listeners synchronously in setup() (see registerBackgroundScript()) — a webRequest listener registered
		// here wakes the background part up after it went to sleep.
		registerListeners("startup");
		if (chrome.permissions && chrome.permissions.onAdded) {
			chrome.permissions.onAdded.addListener(() => {
				registerListeners("runtime");
				invalidateConfig();
			});
		}
		if (chrome.permissions && chrome.permissions.onRemoved) chrome.permissions.onRemoved.addListener(invalidateConfig);
		api.settings.onChange(invalidateConfig);
		api.activation.onChange(invalidateConfig);
		api.activation.onIconClick(onIconClick);
		if (chrome.tabs && chrome.tabs.onRemoved) {
			chrome.tabs.onRemoved.addListener((tabId) => {
				const state = tabs.get(tabId);
				if (state) {
					if (state.saveTimer) clearTimeout(state.saveTimer);
					if (state.notifyTimer) clearTimeout(state.notifyTimer);
				}
				tabs.delete(tabId);
				documents.delete(tabId);
				clicks.delete(tabId);
				listed.delete(tabId);
				views.delete(tabId);
				marked.delete(tabId);
				for (const key of pendingCaptures.keys()) if (key.startsWith(`${tabId} `)) pendingCaptures.delete(key);
				store.deleteTab(tabId).catch(() => {});
			});
		}
		getConfig().catch((err) => console.error("imageInfo: nastavení nejde načíst:", err));

		api.messages.on(PAGE_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const tabId = /** @type {Types.Messages['IMAGE_INFO_PAGE']['request']} */ (message).tabId;
			if (typeof tabId !== "number") {
				sendResponse({ error: "tabId" });
				return;
			}
			pageFor(tabId).then(
				(page) => sendResponse({ page }),
				(err) => sendResponse({ error: err instanceof Error ? err.message : String(err) })
			);
			return true;
		});
		api.messages.on(FETCH_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const { tabId, url, anonymous } = /** @type {Types.Messages['IMAGE_INFO_FETCH']['request']} */ (message);
			if (typeof tabId !== "number" || typeof url !== "string" || !/^https?:/i.test(url)) {
				sendResponse({ error: "url" });
				return;
			}
			// Only an image the listing of the tab showed — not any address an extension page names.
			if (!listed.get(tabId)?.has(url)) {
				sendResponse({ error: "notListed" });
				return;
			}
			fetchImage(tabId, url, anonymous === true).then(
				() => sendResponse({ ok: true }),
				(err) => sendResponse({ error: err instanceof Error ? err.message : String(err) })
			);
			return true;
		});
		api.messages.on(SAVE_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const { tabId, url, anonymous } = /** @type {Types.Messages['IMAGE_INFO_SAVE']['request']} */ (message);
			if (typeof tabId !== "number" || typeof url !== "string") {
				sendResponse({ error: "url" });
				return;
			}
			const frameIds = listed.get(tabId)?.get(url);
			if (!frameIds) {
				sendResponse({ error: "notListed" });
				return;
			}
			saveImage(tabId, url, anonymous === true, frameIds).then(sendResponse, (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
			return true;
		});
		api.messages.on(READ_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const { tabId, url, anonymous, download } = /** @type {Types.Messages['IMAGE_INFO_READ']['request']} */ (message);
			if (typeof tabId !== "number" || typeof url !== "string") {
				sendResponse({ error: "url" });
				return;
			}
			const frameIds = listed.get(tabId)?.get(url);
			if (!frameIds) {
				sendResponse({ error: "notListed" });
				return;
			}
			readImage(tabId, url, anonymous === true, download === true, frameIds).then(sendResponse, (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
			return true;
		});
		api.messages.on(REMOVE_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const { tabId, url } = /** @type {Types.Messages['IMAGE_INFO_REMOVE']['request']} */ (message);
			if (typeof tabId !== "number" || typeof url !== "string") {
				sendResponse({ error: "url" });
				return;
			}
			// Only an image the listing of the tab showed, in the frames that use it.
			const frameIds = listed.get(tabId)?.get(url);
			if (!frameIds) {
				sendResponse({ error: "notListed" });
				return;
			}
			removeImage(tabId, url, frameIds).then(sendResponse, (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
			return true;
		});
		api.messages.on(WATCH_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const tabId = /** @type {Types.Messages['IMAGE_INFO_WATCH']['request']} */ (message).tabId;
			if (typeof tabId !== "number") {
				sendResponse({ error: "tabId" });
				return;
			}
			watchView(tabId).then(
				() => sendResponse({ ok: true }),
				(err) => sendResponse({ error: err instanceof Error ? err.message : String(err) })
			);
			return true;
		});
		api.messages.on(MARK_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const { tabId, images, source } = /** @type {Types.Messages['IMAGE_INFO_MARK']['request']} */ (message);
			if (typeof tabId !== "number" || !isMarkedImages(images) || typeof source !== "string") {
				sendResponse({ error: "marks" });
				return;
			}
			markImages(tabId, images, source).then(sendResponse, (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
			return true;
		});
		// Only from a frame of a tab (collectFrame.mjs) — never from an extension page.
		api.messages.on(VIEW_REPORT_MESSAGE, (message, sender) => {
			const tabId = sender.tab ? sender.tab.id : undefined;
			if (sender.id !== chrome.runtime.id || typeof tabId !== "number" || typeof sender.frameId !== "number" || isExtensionPage(sender)) return;
			const { visible, hovered } = /** @type {Types.Messages['IMAGE_INFO_VIEW_REPORT']['request']} */ (message);
			if (!isViewKeys(visible) || !isViewKeys(hovered)) return;
			const frames = views.get(tabId) ?? new Map();
			if (visible.length || hovered.length) frames.set(sender.frameId, { visible, hovered });
			else frames.delete(sender.frameId);
			if (frames.size) views.set(tabId, frames);
			else views.delete(tabId);
			api.messages.send({ type: VIEW_MESSAGE, tabId, frameId: sender.frameId, visible, hovered });
		});
		api.messages.on(VIEW_STATE_MESSAGE, (message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			const tabId = /** @type {Types.Messages['IMAGE_INFO_VIEW_STATE']['request']} */ (message).tabId;
			if (typeof tabId !== "number") {
				sendResponse({ error: "tabId" });
				return;
			}
			sendResponse({ frames: [...(views.get(tabId) ?? [])].map(([frameId, report]) => ({ frameId, ...report })) });
		});
		api.messages.on(STATUS_MESSAGE, (_message, sender, sendResponse) => {
			if (!isExtensionPage(sender)) {
				sendResponse({ error: "sender" });
				return;
			}
			getStatus().then(sendResponse, (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
			return true;
		});
	},
});
