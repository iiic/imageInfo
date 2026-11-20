//@ts-check
"use strict";

// modules/imageInfo/imageInfo.mjs
//
// Records the HTTP headers of the images of all pages while they load them — the recording itself is done by the
// background part (background-script.mjs), the element is only its status: the headers are recorded / turned off in
// Settings / a permission is missing; whether the extension may list the frames of the page (the listing and the
// metadata from the cache), and in the "On click of the main extension button" mode that the page is listed only at that
// click; in Firefox whether it reads the images of other origins while they load. A button
// requests the missing permissions. The listing of the images of the page with their headers and metadata is
// imageInfoSandbox — it runs in the sandbox (sandbox-modules/imageInfoSandbox) and the core asks the background part of
// this module for it (imageInfo.getPage, imageInfo.onChange, imageInfo.onView, … in SANDBOX_CAPABILITIES of base.mjs).
// A sandboxed module cannot ask for a permission — that is why the button stays here.
import { BaseElement, registerModule, t } from "../../sdk.mjs";
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
	USES_PERMISSIONS,
	SETTINGS_SCHEMA,
	STATUS_MESSAGE,
	loadConfig,
	neededPermissions,
	missingPermissions,
} from "./module.mjs";

/** @implements {Classes.ExtensionImageInfo} */
class ExtensionImageInfo extends /** @type {Types.WithFields<typeof BaseElement, Classes.ExtensionImageInfo.Fields>} */ (BaseElement) {
	// activationSpec is looked up from the registry in BaseElement.init() (see ACTIVATION_SPEC in module.mjs).

	/**
	 * @override
	 * @type {typeof Classes.ExtensionImageInfo.observedAttributes}
	 */
	static get observedAttributes() {
		return [];
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['connectedCallback']}
	 */
	connectedCallback() {
		this.className = "module-output";
		this.textContent = t("imageInfo_loading");
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['disconnectedCallback']}
	 */
	disconnectedCallback() {
		// The settings and permission subscriptions are cancelled here.
		super.disconnectedCallback();
		for (const unsubscribe of this._unsubscribers || []) unsubscribe();
		this._unsubscribers = [];
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['connectedMoveCallback']}
	 */
	connectedMoveCallback() {
		// The module holds no state tied to a position in the DOM.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['adoptedCallback']}
	 */
	adoptedCallback() {
		// The module does not need to react to a move into another document.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['attributeChangedCallback']}
	 */
	attributeChangedCallback(_name, _oldValue, _newValue) {
		// The module observes no HTML attributes.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionImageInfo['init']}
	 */
	async init({ outputEl, name, mode, location }) {
		await super.init({ outputEl, name, mode, location });

		if (!this.isActivationSatisfied(mode)) {
			this.textContent = t("imageInfo_disabled", name);
			return;
		}

		this.textContent = "";
		this._statusEl = document.createElement("div");
		this._statusEl.className = "image-info-status";
		this.append(this._statusEl);

		// A change of the settings and granting/removing a permission refresh the status (the background part
		// registers its listeners after the permission, a moment later).
		this._unsubscribers = [
			this.api.settings.onChange(() => this._renderStatus()),
			this.api.permissions.onChange(() => {
				void this._renderStatus();
				setTimeout(() => void this._renderStatus(), 500);
			}),
		];

		await this._renderStatus();
	}

	// The status of the recording, of the page access and (Firefox) of reading while loading, with the button.
	/** @type {Classes.ExtensionImageInfo['_renderStatus']} */
	async _renderStatus() {
		const generation = (this._statusGeneration || 0) + 1;
		this._statusGeneration = generation;
		const name = this._name || TAG;
		/** @type {[Types.ImageInfo.StatusResponse | undefined, Pick<Types.ImageInfo.Config, 'headers' | 'capture'>]} */
		let result;
		try {
			result = await Promise.all([/** @type {Promise<Types.ImageInfo.StatusResponse | undefined>} */ (this.api.messages.send({ type: STATUS_MESSAGE })), loadConfig(this.api)]);
		} catch (err) {
			result = [{ error: err instanceof Error ? err.message : String(err) }, { headers: true, capture: false }];
		}
		if (generation !== this._statusGeneration) return;
		const [status, config] = result;
		const missing = await missingPermissions(this.api, neededPermissions(config));
		if (generation !== this._statusGeneration) return;

		const box = this._statusEl;
		box.textContent = "";
		const line = (/** @type {string} */ text, /** @type {string} */ className = "") => {
			const paragraph = document.createElement("p");
			if (className) paragraph.className = className;
			paragraph.textContent = text;
			box.appendChild(paragraph);
			return paragraph;
		};
		if (!status || "error" in status) {
			line(t("imageInfo_status_error", name, status ? status.error : t("imageInfo_status_no_response")), "error");
		} else {
			if (status.headers === "on") line(t("imageInfo_status_headers_on", name));
			else if (status.headers === "off") line(t("imageInfo_status_headers_off", name));
			else line(t("imageInfo_status_headers_no_permission", name), "image-info-status__warning");
			if (status.headers === "on" && status.listening && !status.persistent) line(t("imageInfo_status_not_persistent"), "image-info-status__note");
			line(status.pageAccess ? t("imageInfo_status_page_access") : t("imageInfo_status_no_page_access"), status.pageAccess ? "" : "image-info-status__warning");
			if (status.clickOnly) line(t("imageInfo_status_click_only"));
			if (status.capture === "on") line(t("imageInfo_status_capture_on"));
			else if (status.capture === "noPermission") line(t("imageInfo_status_capture_no_permission"), "image-info-status__warning");
		}
		if (!missing) return;

		// There is no chrome.permissions in the floating window's <iframe> — the button would always fail.
		if (typeof chrome.permissions === "undefined") {
			line(t("imageInfo_status_grant_elsewhere"), "image-info-status__note");
			return;
		}
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = t("imageInfo_btn_grant");
		button.title = [...missing.permissions, ...missing.origins].join(", ");
		button.addEventListener("click", async () => {
			// request() is started right away, before the first await — the browser accepts it only as a direct
			// reaction to a click.
			if (await this.api.permissions.request(missing)) await this._renderStatus();
		});
		box.appendChild(button);
	}
}

customElements.define(TAG, ExtensionImageInfo);

registerModule({
	name: MODULE_NAME,
	tag: TAG,
	description: DESCRIPTION,
	activationSpec: ACTIVATION_SPEC,
	usesPermissions: USES_PERMISSIONS,
	settingsSchema: SETTINGS_SCHEMA,
	defaultActivationMode: DEFAULT_ACTIVATION_MODE,
	defaultDisplayLocation: DEFAULT_DISPLAY_LOCATION,
	defaultOutputElement: DEFAULT_OUTPUT_ELEMENT,
	defaultShowHeading: DEFAULT_SHOW_HEADING,
	styles: STYLES,
});
