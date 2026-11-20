//@ts-check
"use strict";

// modules/imageInfo/store.mjs
// The network records of the tabs (records.mjs) in the module's own IndexedDB — one entry per tab. Not
// chrome.storage.session: the background part writes after every few images of a loading page, and every
// write of chrome.storage would be sent with its whole value to all extension pages that listen to its
// changes. Not api.data either — the records belong to the tabs of this browser session only: the
// background part deletes the entry of a closed tab, at the start of the browser all of them (the numbers
// of the tabs start again) and at its own start the entries of tabs that no longer exist. Records of
// private windows are never written (the background part keeps them only in memory).
//
// Written and read only by the background part. The connection stays open; it closes when the browser or
// another version of the database terminates it.
//
// The second store keeps the listing of the images of a tab made at the last click on the extension button (the
// icon_click mode, see background-script.mjs) — one entry per tab too, deleted with the records of the tab: in Chrome
// the service worker goes to sleep a while after the click, and a surface asks for the listing later as well.

const IDB_NAME = "imageInfo";
const IDB_VERSION = 2;
const STORE_NAME = "tabs";
const CLICKS_STORE = "clicks";
const STORES = [STORE_NAME, CLICKS_STORE];

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @type {Functions.ImageInfo.Store.openDb} */
function openDb() {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(IDB_NAME, IDB_VERSION);
			request.onerror = () => {
				dbPromise = null;
				reject(request.error);
			};
			request.onupgradeneeded = () => {
				const db = request.result;
				for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "tabId" });
			};
			request.onsuccess = () => {
				const db = request.result;
				const reset = () => {
					if (dbPromise) dbPromise = null;
				};
				db.onclose = reset;
				db.onversionchange = () => {
					db.close();
					reset();
				};
				resolve(db);
			};
		});
	}
	return dbPromise;
}

// Runs work in one transaction over the stores and resolves with what it stored in result.value by the end of it.
/** @type {Functions.ImageInfo.Store.transact} */
async function transact(mode, names, work) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(names, mode);
		const result = work(tx);
		tx.oncomplete = () => resolve(result.value);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
	});
}

// The records of a tab (none = []).
/** @type {Functions.ImageInfo.Store.loadTab} */
export function loadTab(tabId) {
	return transact("readonly", [STORE_NAME], (tx) => {
		/** @type {{ value: unknown[] }} */
		const result = { value: [] };
		const request = tx.objectStore(STORE_NAME).get(tabId);
		request.onsuccess = () => {
			const entry = /** @type {{ records?: unknown } | undefined} */ (request.result);
			result.value = entry && Array.isArray(entry.records) ? entry.records : [];
		};
		return result;
	});
}

/** @type {Functions.ImageInfo.Store.saveTab} */
export function saveTab(tabId, records) {
	return transact("readwrite", [STORE_NAME], (tx) => {
		tx.objectStore(STORE_NAME).put({ tabId, updatedAt: Date.now(), records });
		return { value: undefined };
	});
}

// The listing of the last click of a tab (an unchecked value from the database; none = null).
/** @type {Functions.ImageInfo.Store.loadClick} */
export function loadClick(tabId) {
	return transact("readonly", [CLICKS_STORE], (tx) => {
		/** @type {{ value: unknown }} */
		const result = { value: null };
		const request = tx.objectStore(CLICKS_STORE).get(tabId);
		request.onsuccess = () => {
			const entry = /** @type {{ listing?: unknown } | undefined} */ (request.result);
			result.value = entry && "listing" in entry ? entry.listing : null;
		};
		return result;
	});
}

/** @type {Functions.ImageInfo.Store.saveClick} */
export function saveClick(tabId, listing) {
	return transact("readwrite", [CLICKS_STORE], (tx) => {
		tx.objectStore(CLICKS_STORE).put({ tabId, listing });
		return { value: undefined };
	});
}

// The records of the tab and the listing of its last click.
/** @type {Functions.ImageInfo.Store.deleteTab} */
export function deleteTab(tabId) {
	return transact("readwrite", STORES, (tx) => {
		for (const name of STORES) tx.objectStore(name).delete(tabId);
		return { value: undefined };
	});
}

// Deletes the entries of all tabs except the given ones (null = all of them) — the records and the listings of the clicks.
/** @type {Functions.ImageInfo.Store.keepTabs} */
export function keepTabs(tabIds) {
	return transact("readwrite", STORES, (tx) => {
		for (const name of STORES) {
			const store = tx.objectStore(name);
			if (tabIds === null) {
				store.clear();
				continue;
			}
			const request = store.getAllKeys();
			request.onsuccess = () => {
				for (const key of request.result) if (typeof key === "number" && !tabIds.has(key)) store.delete(key);
			};
		}
		return { value: undefined };
	});
}
