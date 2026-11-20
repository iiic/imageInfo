/**
 * @file modules/imageInfo/store.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/store.mjs — the network records of the tabs in the
 * module's own IndexedDB (one entry per tab, only for this browser session).
 */

declare global {

	namespace Functions {

		namespace ImageInfo {

			namespace Store {

				/** The open connection to the database (created on first use) */
				type openDb = () => Promise<IDBDatabase>;

				/** Work in one transaction over the stores; resolves with result.value after the transaction completes */
				type transact = <T>( mode: IDBTransactionMode, names: string[], work: ( tx: IDBTransaction ) => { value: T } ) => Promise<T>;

				/** The stored records of a tab (unchecked values from the database; none = []) */
				type loadTab = ( tabId: number ) => Promise<unknown[]>;

				type saveTab = ( tabId: number, records: Types.ImageInfo.NetworkRecord[] ) => Promise<void>;

				/** The stored listing of the last click of a tab (an unchecked value from the database; none = null) */
				type loadClick = ( tabId: number ) => Promise<unknown>;

				type saveClick = ( tabId: number, listing: Types.ImageInfo.ClickListing ) => Promise<void>;

				/** Deletes the records of a tab and the listing of its last click */
				type deleteTab = ( tabId: number ) => Promise<void>;

				/** Deletes the entries of all tabs except the given ones (null = all) — the records and the listings of the clicks */
				type keepTabs = ( tabIds: Set<number> | null ) => Promise<void>;

			}

		}

	}

}

export { };
