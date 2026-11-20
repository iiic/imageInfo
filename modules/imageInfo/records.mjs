//@ts-check
"use strict";

// modules/imageInfo/records.mjs
// The network records of images — what the background part keeps for every tab while the page loads
// (webRequest): the address, the status, all response headers, whether the response came from the cache,
// the IP address of the server, the Accept header of the request (the frame needs it to find the file in
// the cache, see collectFrame.mjs) and, in Firefox, the metadata read from the response while it loaded
// (capture). One record per address — a later load of the same address replaces it, a record that is older
// than the others goes first above MAX_RECORDS_PER_TAB. Pure functions without chrome.* (the tests use them
// directly).
//
// A redirected request is recorded under the address the page asked for (the address of its element and of its
// Resource Timing entry), with the redirects and the final address; the headers are those of the final response.
// A document that is an image (an image opened in the tab or in a frame) is recorded like an image of a page.
//
// The records are kept by address, not by document: Firefox loads an image the page used before from its
// own memory without any request (verified in Firefox 157 — a reload of the page sent no requests of its
// images), so the listing finds the headers of such an image in a record of an earlier load in the tab.

// The most records of one tab, response headers of one record, characters of one header value and of the
// metadata of one record (JSON — the default, the settings of the module change it).
export const MAX_RECORDS_PER_TAB = 300;
export const MAX_HEADERS = 64;
export const MAX_HEADER_VALUE = 1000;
export const MAX_METADATA_CHARS = 64 * 1024;
// The most redirects of one request (the browsers give up after 20).
export const MAX_REDIRECTS = 20;

// Headers whose value the listing does not show (cookies of the server) — only that they were there.
const HIDDEN_HEADERS = new Set(["set-cookie", "set-cookie2"]);

// Response headers as [name, value] — a value of a hidden header replaced by its length, long values cut.
/** @type {Functions.ImageInfo.Records.normalizeHeaders} */
export function normalizeHeaders(headers) {
	/** @type {Types.ImageInfo.Header[]} */
	const result = [];
	for (const header of headers || []) {
		if (result.length >= MAX_HEADERS) break;
		if (!header || typeof header.name !== "string") continue;
		let value = typeof header.value === "string" ? header.value : Array.isArray(header.binaryValue) ? String.fromCharCode(...header.binaryValue.slice(0, MAX_HEADER_VALUE)) : "";
		if (HIDDEN_HEADERS.has(header.name.toLowerCase())) value = `(${value.length} B)`;
		else if (value.length > MAX_HEADER_VALUE) value = `${value.slice(0, MAX_HEADER_VALUE - 1)}…`;
		result.push([header.name, value]);
	}
	return result;
}

// The value of a request header (the first one with the name), or null.
/** @type {Functions.ImageInfo.Records.headerValue} */
export function headerValue(headers, name) {
	const lower = name.toLowerCase();
	const found = (headers || []).find((header) => header && typeof header.name === "string" && header.name.toLowerCase() === lower);
	return found && typeof found.value === "string" ? found.value : null;
}

// A record from the report of a finished (or failed) request and what was noted when it was sent.
/** @type {Functions.ImageInfo.Records.buildRecord} */
export function buildRecord(details, request) {
	const redirects = request && request.redirects ? request.redirects : [];
	return {
		url: redirects.length ? redirects[0].url : details.url,
		finalUrl: redirects.length ? details.url : null,
		redirects,
		method: details.method || "GET",
		type: details.type,
		frameId: typeof details.frameId === "number" ? details.frameId : 0,
		initiator: details.initiator ?? details.originUrl ?? null,
		statusCode: typeof details.statusCode === "number" ? details.statusCode : null,
		statusLine: typeof details.statusLine === "string" ? details.statusLine : null,
		fromCache: details.fromCache === true,
		ip: typeof details.ip === "string" && details.ip ? details.ip : null,
		headers: normalizeHeaders(details.responseHeaders),
		accept: request ? request.accept : null,
		startedAt: Math.round(request ? request.startedAt : details.timeStamp),
		completedAt: Math.round(details.timeStamp),
		error: typeof details.error === "string" ? details.error : null,
		capture: null,
	};
}

// Is the response of a document (of the tab or of a frame) an image — Content-Type image/*?
/** @type {Functions.ImageInfo.Records.isImageDocument} */
export function isImageDocument(details) {
	if (details.type !== "main_frame" && details.type !== "sub_frame") return false;
	const type = headerValue(details.responseHeaders, "content-type");
	return !!type && type.trim().toLowerCase().startsWith("image/");
}

// The metadata as it is stored with a record: at most maxChars (the setting of the module, otherwise
// MAX_METADATA_CHARS) characters of JSON — the entries from the end of the largest groups go first, with the
// warning "limit".
/** @type {Functions.ImageInfo.Records.compactMetadata} */
export function compactMetadata(metadata, maxChars = MAX_METADATA_CHARS) {
	if (JSON.stringify(metadata).length <= maxChars) return metadata;
	/** @type {Types.ImageInfo.Metadata} */
	const copy = { ...metadata, groups: metadata.groups.map((group) => ({ id: group.id, entries: [...group.entries] })), warnings: [...metadata.warnings, "limit"] };
	while (JSON.stringify(copy).length > maxChars) {
		const largest = copy.groups.reduce((best, group) => (group.entries.length > best.entries.length ? group : best), copy.groups[0]);
		if (!largest || largest.entries.length === 0) break;
		largest.entries.splice(Math.max(0, largest.entries.length - Math.ceil(largest.entries.length / 4)));
	}
	copy.groups = copy.groups.filter((group) => group.entries.length > 0);
	return copy;
}

// The records of a tab with a new one: a record of the same address is replaced (the metadata captured
// while loading stays when the new record has none — the same response, the capture may have finished
// first), the newest is last; above max the oldest go.
/** @type {Functions.ImageInfo.Records.upsertRecord} */
export function upsertRecord(records, record, max = MAX_RECORDS_PER_TAB) {
	const previous = records.find((item) => item.url === record.url);
	const merged = previous && !record.capture && previous.capture && previous.capture.at >= record.startedAt - 1000 ? { ...record, capture: previous.capture } : record;
	const next = records.filter((item) => item.url !== record.url);
	next.push(merged);
	return next.length > max ? next.slice(next.length - max) : next;
}

// A record of an image downloaded once more (the button "Load information" of the listing — the page loaded it before the
// recording, or the headers were not recorded): the headers of that response, not of the load of the page.
/** @type {Functions.ImageInfo.Records.buildDownloadRecord} */
export function buildDownloadRecord(url, response, accept, startedAt, completedAt) {
	return {
		url,
		finalUrl: response.redirected && response.url && response.url !== url ? response.url : null,
		redirects: [],
		method: "GET",
		type: "download",
		frameId: 0,
		initiator: null,
		statusCode: response.status,
		statusLine: `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
		fromCache: false,
		ip: null,
		headers: normalizeHeaders(response.headers.map(([name, value]) => ({ name, value }))),
		accept,
		startedAt: Math.round(startedAt),
		completedAt: Math.round(completedAt),
		error: null,
		capture: null,
		downloaded: true,
	};
}

// The metadata captured while loading into the record of the address (null = no such record yet). The capture has the
// address of the response — of a redirected request the final one.
/** @type {Functions.ImageInfo.Records.attachCapture} */
export function attachCapture(records, url, capture) {
	const index = records.findIndex((item) => item.url === url || item.finalUrl === url);
	if (index < 0) return null;
	const next = [...records];
	next[index] = { ...next[index], capture };
	return next;
}

// Is the value a stored record (from IndexedDB — older versions of the extension, damaged data)?
/** @type {Functions.ImageInfo.Records.isRecord} */
export function isRecord(value) {
	if (!value || typeof value !== "object") return false;
	const record = /** @type {Record<string, unknown>} */ (value);
	return typeof record.url === "string" && Array.isArray(record.headers) && typeof record.completedAt === "number";
}
