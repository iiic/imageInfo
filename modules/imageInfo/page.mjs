//@ts-check
"use strict";

// modules/imageInfo/page.mjs
// The listing of the images of a page as the background part gives it to imageInfoSandbox (the core passes it
// on as imageInfo.getPage): the reports of all frames of the tab (collectFrame.mjs) joined by the key of the
// image — where the page uses it, its Resource Timing, the metadata of its file — with the network record of
// its address (records.mjs: the status, the response headers, from the cache, the IP address; in Firefox the
// metadata read while the response loaded, when the file could not be read from the cache). Images the
// document requested but does not use in an element or CSS any more (new Image(), a removed element, a
// tracking pixel) come from the records alone — only those requested since the document started, older
// records of the tab belong to earlier pages. An image the button "Remove from the document" removed keeps the usages
// it had (removed: true — collectFrame.mjs reports them), they do not count in usageCount. The listing carries when its
// document started (documentAt) — the same number also after history.pushState() of a web app, which changes only the
// address (imageInfoSandbox tells a new address of the same document by it). Pure functions without chrome.* and DOM.

// Records requested this long before the start of the document still belong to it (the clocks of the page and
// of the background part differ a little).
export const NETWORK_ONLY_SLACK_MS = 2000;
// The most usages of one image the listing carries (a sprite used by hundreds of elements).
export const MAX_USAGES_PER_IMAGE = 50;

/** @type {Functions.ImageInfo.Page.originOf} */
function originOf(url) {
	try {
		const parsed = new URL(url || "");
		return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
	} catch {
		return null;
	}
}

// The file result of the metadata captured while the response loaded.
/** @type {Functions.ImageInfo.Page.fromCapture} */
export function fromCapture(capture) {
	if (capture.metadata) return { source: capture.download ? "download" : "capture", bytes: capture.bytes, complete: capture.complete, contentType: null, metadata: capture.metadata };
	return { source: null, error: "failed", detail: capture.error ?? "" };
}

// The record without the captured metadata (that one goes into the file of the image).
/** @type {Functions.ImageInfo.Page.withoutCapture} */
function withoutCapture(record) {
	const { capture: _capture, ...network } = record;
	return network;
}

/** @type {Functions.ImageInfo.Page.buildPage} */
export function buildPage({ tab, frames, records, status, collectedAt, documentAt = null, error = null, errorDetail = null }) {
	const ordered = [...frames].sort((a, b) => (a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : a.frameId - b.frameId));
	const top = ordered.find((frame) => frame.frameId === 0) ?? null;
	const pageOrigin = originOf(tab ? tab.url : null) ?? (top ? originOf(top.report.url) : null);
	/** @type {Map<string, Types.ImageInfo.ImageEntry>} */
	const entries = new Map();
	const entry = (/** @type {string} */ key, /** @type {string} */ url) => {
		let found = entries.get(key);
		if (!found) {
			const origin = originOf(url);
			found = {
				key,
				url,
				scheme: url.slice(0, Math.max(0, url.indexOf(":"))),
				sameOrigin: origin === null || pageOrigin === null ? null : origin === pageOrigin,
				usages: [],
				usageCount: 0,
				timing: null,
				network: null,
				file: null,
			};
			entries.set(key, found);
		}
		return found;
	};

	for (const { frameId, report } of ordered) {
		for (const usage of report.usages) {
			const image = entry(usage.key, usage.url);
			if (!usage.removed) image.usageCount++;
			if (image.usages.length < MAX_USAGES_PER_IMAGE) image.usages.push({ ...usage, frameId, frameUrl: report.url });
		}
	}
	for (const { report } of ordered) {
		for (const timing of report.timings) {
			const image = entry(timing.key, timing.url);
			if (!image.timing) image.timing = timing;
		}
	}
	for (const { report } of ordered) {
		for (const [key, file] of Object.entries(report.files)) {
			const image = entries.get(key);
			if (image && (!image.file || (image.file.source === null && file.source !== null))) image.file = file;
		}
	}

	// A record by the address the page asked for, or by where its redirects led (when the page uses that address itself).
	/** @type {Map<string, Types.ImageInfo.NetworkRecord>} */
	const byUrl = new Map();
	for (const record of records) if (record.finalUrl) byUrl.set(record.finalUrl, record);
	for (const record of records) byUrl.set(record.url, record);
	const join = (/** @type {Types.ImageInfo.ImageEntry} */ image, /** @type {Types.ImageInfo.NetworkRecord} */ record) => {
		image.network = withoutCapture(record);
		if (record.capture && (!image.file || image.file.source === null)) image.file = fromCapture(record.capture);
	};
	for (const image of entries.values()) {
		const record = byUrl.get(image.url);
		if (record) join(image, record);
	}
	const start = top ? top.report.timeOrigin : documentAt;
	for (const record of records) {
		if (entries.has(record.url) || (record.finalUrl && entries.has(record.finalUrl)) || (start !== null && record.startedAt < start - NETWORK_ONLY_SLACK_MS)) continue;
		join(entry(record.url, record.url), record);
	}

	return {
		tab,
		status,
		error,
		errorDetail,
		collectedAt,
		documentAt: start,
		frames: ordered.map(({ frameId, report }) => ({
			frameId,
			url: report.url,
			origin: report.origin,
			contentType: report.contentType ?? null,
			readyState: report.readyState ?? null,
			usages: report.usages.filter((usage) => !usage.removed).length,
			truncated: report.truncated,
			cssElements: report.cssElements,
			elapsedMs: report.elapsedMs,
		})),
		images: [...entries.values()],
	};
}
