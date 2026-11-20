/**
 * @file modules/imageInfo/imageInfo.globals.d.ts
 * @description Global TypeScript declarations for modules/imageInfo/imageInfo.mjs — the status of recording the headers of
 * images (recording / turned off / a permission missing with a button), of the page access and of reading other origins while
 * loading (Firefox). The listing of the images of the page is imageInfoSandbox (sandbox-modules/imageInfoSandbox).
 */

declare global {

	interface HTMLElementTagNameMap {
		'extension-image-info': Classes.ExtensionImageInfo;
	}

	namespace Classes {

		/** The imageInfo module element. */
		class ExtensionImageInfo extends BaseElement {

			/** Sequence number of the last status render — older concurrent ones are discarded */
			_statusGeneration?: number;

			/** Unsubscribing the settings and permission listeners (in disconnectedCallback()) */
			_unsubscribers?: Array<() => void>;

			_statusEl: HTMLDivElement;

			static override get observedAttributes(): string[];
			override connectedCallback(): void;
			override disconnectedCallback(): void;
			override connectedMoveCallback(): void;
			override adoptedCallback(): void;
			override attributeChangedCallback( name: string, oldValue: string | null, newValue: string | null ): void;
			override init( options: Types.ModuleInitOptions ): Promise<void>;

			/** The status of the recording, of the page access and of reading while loading, with the permission button */
			_renderStatus(): Promise<void>;

		}

		namespace ExtensionImageInfo {

			/** Instance properties (without methods); the base of the class is cast to them in JS — see Types.WithFields */
			type Fields = Pick<ExtensionImageInfo, '_statusGeneration' | '_unsubscribers' | '_statusEl'>;

		}

	}

}

export { };
