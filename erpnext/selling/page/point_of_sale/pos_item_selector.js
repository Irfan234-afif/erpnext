import onScan from "onscan.js";

erpnext.PointOfSale.ItemSelector = class {
	// eslint-disable-next-line no-unused-vars
	constructor({ frm, wrapper, events, pos_profile, settings }) {
		this.wrapper = wrapper;
		this.events = events;
		this.pos_profile = pos_profile;
		this.hide_images = settings.hide_images;
		this.auto_add_item = settings.auto_add_item_to_cart;

		this.inti_component();
	}

	inti_component() {
		this.prepare_dom();
		this.make_search_bar();
		this.make_mobile_search_bar();
		this.load_items_data();
		this.bind_events();
		this.attach_shortcuts();
	}

	prepare_dom() {
		this.wrapper.append(
			`<section class="items-selector">
				<div class="filter-section">
					<div class="label">${__("All Items")}</div>
					<div class="search-field"></div>
					<div class="item-group-field"></div>
				</div>
				<div class="items-container"></div>
			</section>
			<div class="items-selector-modal-overlay">
				<div class="items-selector-modal-content">
					<div class="mobile-items-selector">
						<div class="filter-section">
							<div class="mobile-search-field"></div>
							<div class="mobile-item-group-field"></div>
							<button class="btn btn-modal-close btn-link close-modal-btn" data-dismiss="modal">
								${frappe.utils.icon("close-alt", "sm", "close-alt")}
							</button>
						</div>
						<div class="items-container"></div>
					</div>
				</div>
			</div>`
		);

		this.$component = this.wrapper.find(".items-selector");
		this.$items_container = this.$component.find(".items-container");
		this.$modal_overlay = this.wrapper.find(".items-selector-modal-overlay");
		this.$modal_content = this.$modal_overlay.find(".items-selector-modal-content");
		this.$modal_items_selector = this.$modal_content.find(".mobile-items-selector");
		this.$modal_items_container = this.$modal_items_selector.find(".items-container");
		this.$close_modal_btn = this.$modal_content.find(".close-modal-btn");

		this.$modal_overlay.css("display", "none");
	}

	async load_items_data() {
		if (!this.item_group) {
			frappe.call({
				method: "erpnext.selling.page.point_of_sale.point_of_sale.get_parent_item_group",
				async: false,
				callback: (r) => {
					if (r.message) this.parent_item_group = r.message;
				},
			});
		}
		if (!this.price_list) {
			const res = await frappe.db.get_value("POS Profile", this.pos_profile, "selling_price_list");
			this.price_list = res.message.selling_price_list;
		}

		this.get_items({}).then(({ message }) => {
			this.render_item_list(message.items);
		});
	}

	async search_auto_item(search_term) {
		// this.get_items({ search_term })
		// this.get_items({ search_term }).then(({ message }) => {
		// 	console.log("Message : ", message)
		// 	// eslint-disable-next-line no-unused-vars
		// 	const { items, serial_no, batch_no, barcode } = message;
		// 	if (items.length == 1) {
		// 		const item = items[0]
		// 		const { barcode, item_code, batch_no, serial_no, uom, price_list_rate, stock_uom } = item
		// 		const rate = price_list_rate
		// 		this.events.item_selected({
		// 			field: "qty",
		// 			value: "+1",
		// 			item: { item_code, batch_no, serial_no, uom, rate, stock_uom },
		// 		});
		// 	}
		// });

		try {
			const { message } = await this.get_items({ search_term });
			if (message.length == 0) return false;
			console.log("message : ", message)
			const { items } = message;
			console.log("items : ", items)
			if (items.length == 1) {
				const item = items[0]
				const { barcode, item_code, batch_no, serial_no, uom, price_list_rate, stock_uom } = item
				const rate = price_list_rate
				this.events.item_selected({
					field: "qty",
					value: "+1",
					item: { item_code, batch_no, serial_no, uom, rate, stock_uom },
				});
				return true;
			} else {
				frappe.msgprint(__("Item Not Found"));
				return false;
			}
		} catch (error) {
			console.log("ERror : ", error)
			return false;
		}

	}

	get_items({ start = 0, page_length = 40, search_term = "" }) {
		const doc = this.events.get_frm().doc;
		const price_list = (doc && doc.selling_price_list) || this.price_list;
		let { item_group, pos_profile } = this;

		!item_group && (item_group = this.parent_item_group);

		return frappe.call({
			method: "erpnext.selling.page.point_of_sale.point_of_sale.get_items",
			freeze: true,
			args: { start, page_length, price_list, item_group, search_term, pos_profile },
		});
	}

	render_item_list(items) {
		this.$items_container.html("");
		this.$modal_items_container.html("");

		items.forEach((item) => {
			const item_html = this.get_item_html(item);
			this.$items_container.append(item_html);
			this.$modal_items_container.append(item_html);
		});
	}

	get_item_html(item) {
		const me = this;
		// eslint-disable-next-line no-unused-vars
		const { item_image, serial_no, batch_no, barcode, actual_qty, uom, price_list_rate } = item;
		const precision = flt(price_list_rate, 2) % 1 != 0 ? 2 : 0;
		let indicator_color;
		let qty_to_display = actual_qty;

		if (item.is_stock_item) {
			indicator_color = actual_qty > 10 ? "green" : actual_qty <= 0 ? "red" : "orange";

			if (Math.round(qty_to_display) > 999) {
				qty_to_display = Math.round(qty_to_display) / 1000;
				qty_to_display = qty_to_display.toFixed(1) + "K";
			}
		} else {
			indicator_color = "";
			qty_to_display = "";
		}

		function get_item_image_html() {
			if (!me.hide_images && item_image) {
				return `<div class="item-qty-pill">
							<span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span>
						</div>
						<div class="flex items-center justify-center border-b-grey text-6xl text-grey-100" style="height:8rem; min-height:8rem">
							<img
								onerror="cur_pos.item_selector.handle_broken_image(this)"
								class="h-full item-img" src="${item_image}"
								alt="${frappe.get_abbr(item.item_name)}"
							>
						</div>`;
			} else {
				return `<div class="item-qty-pill">
							<span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span>
						</div>
						<div class="item-display abbr">${frappe.get_abbr(item.item_name)}</div>`;
			}
		}

		return `<div class="item-wrapper"
				data-item-code="${escape(item.item_code)}" data-serial-no="${escape(serial_no)}"
				data-batch-no="${escape(batch_no)}" data-uom="${escape(uom)}"
				data-rate="${escape(price_list_rate || 0)}"
				data-stock-uom="${escape(item.stock_uom)}"
				title="${item.item_name}">

				${get_item_image_html()}

				<div class="item-detail">
					<div class="item-name">
						${frappe.ellipsis(item.item_name, 18)}
					</div>
					<div class="item-rate">${format_currency(price_list_rate, item.currency, precision) || 0} / ${uom}</div>
				</div>
			</div>`;
	}

	handle_broken_image($img) {
		const item_abbr = $($img).attr("alt");
		$($img).parent().replaceWith(`<div class="item-display abbr">${item_abbr}</div>`);
	}

	make_search_bar() {
		const me = this;
		this.$component.find(".search-field").html("");
		this.$component.find(".item-group-field").html("");

		this.search_field = frappe.ui.form.make_control({
			df: {
				label: __("Search"),
				fieldtype: "Data",
				placeholder: __("Search by item code, serial number or barcode"),
			},
			parent: this.$component.find(".search-field"),
			render_input: true,
		});
		this.item_group_field = frappe.ui.form.make_control({
			df: {
				label: __("Item Group"),
				fieldtype: "Link",
				options: "Item Group",
				placeholder: __("Select item group"),
				onchange: function () {
					me.item_group = this.value;
					!me.item_group && (me.item_group = me.parent_item_group);
					me.filter_items();
				},
				get_query: function () {
					const doc = me.events.get_frm().doc;
					return {
						query: "erpnext.selling.page.point_of_sale.point_of_sale.item_group_query",
						filters: {
							pos_profile: doc ? doc.pos_profile : "",
						},
					};
				},
			},
			parent: this.$component.find(".item-group-field"),
			render_input: true,
		});
		this.search_field.toggle_label(false);
		this.item_group_field.toggle_label(false);

		this.attach_clear_btn();
	}

	make_mobile_search_bar() {
		const me = this;
		this.$modal_items_selector.find(".mobile-search-field").html("");
		this.$modal_items_selector.find(".mobile-item-group-field").html("");

		this.search_field = frappe.ui.form.make_control({
			df: {
				label: __("Search"),
				fieldtype: "Data",
				placeholder: __("Search by item code, serial number or barcode"),
			},
			parent: this.$modal_items_selector.find(".mobile-search-field"),
			render_input: true,
		});
		this.item_group_field = frappe.ui.form.make_control({
			df: {
				label: __("Item Group"),
				fieldtype: "Link",
				options: "Item Group",
				placeholder: __("Select item group"),
				onchange: function () {
					me.item_group = this.value;
					!me.item_group && (me.item_group = me.parent_item_group);
					me.filter_items();
				},
				get_query: function () {
					const doc = me.events.get_frm().doc;
					return {
						query: "erpnext.selling.page.point_of_sale.point_of_sale.item_group_query",
						filters: {
							pos_profile: doc ? doc.pos_profile : "",
						},
					};
				},
			},
			parent: this.$modal_items_selector.find(".mobile-item-group-field"),
			render_input: true,
		});
		this.search_field.toggle_label(false);
		this.item_group_field.toggle_label(false);

		this.attach_clear_btn();
	}

	attach_clear_btn() {
		this.search_field.$wrapper.find(".control-input").append(
			`<span class="link-btn" style="top: 2px;">
				<a class="btn-open no-decoration" title="${__("Clear")}">
					${frappe.utils.icon("close", "sm")}
				</a>
			</span>`
		);

		this.$clear_search_btn = this.search_field.$wrapper.find(".link-btn");

		this.$clear_search_btn.on("click", "a", () => {
			this.set_search_value("");
			this.search_field.set_focus();
		});
	}

	set_search_value(value) {
		$(this.search_field.$input[0]).val(value).trigger("input");
	}

	bind_events() {
		const me = this;
		window.onScan = onScan;

		onScan.decodeKeyEvent = function (oEvent) {
			var iCode = this._getNormalizedKeyNum(oEvent);
			switch (true) {
				case iCode >= 48 && iCode <= 90: // numbers and letters
				case iCode >= 106 && iCode <= 111: // operations on numeric keypad (+, -, etc.)
				case (iCode >= 160 && iCode <= 164) || iCode == 170: // ^ ! # $ *
				case iCode >= 186 && iCode <= 194: // (; = , - . / `)
				case iCode >= 219 && iCode <= 222: // ([ \ ] ')
				case iCode == 32: // spacebar
					if (oEvent.key !== undefined && oEvent.key !== "") {
						return oEvent.key;
					}

					var sDecoded = String.fromCharCode(iCode);
					switch (oEvent.shiftKey) {
						case false:
							sDecoded = sDecoded.toLowerCase();
							break;
						case true:
							sDecoded = sDecoded.toUpperCase();
							break;
					}
					return sDecoded;
				case iCode >= 96 && iCode <= 105: // numbers on numeric keypad
					return 0 + (iCode - 96);
			}
			return "";
		};

		onScan.attachTo(document, {
			onScan: (sScancode) => {
				if (this.search_field && (this.$component.is(":visible") || this.$modal_overlay.hasClass("show"))) {
					this.search_field.set_focus();
					this.set_search_value(sScancode);
					this.barcode_scanned = true;
				}
			},
		});

		// Handle item clicks in both desktop and modal
		this.$component.on("click", ".item-wrapper", function () {
			console.log("Click from normal")
			me.handle_item_click($(this));
		});

		this.$modal_items_container.on("click", ".item-wrapper", function () {
			console.log("Click from modal")
			me.handle_item_click($(this));
			// Close modal after item selection
			me.toggle_modal(false);
		});

		// Modal close events
		this.$close_modal_btn.on("click", () => {
			this.toggle_modal(false);
		});

		this.$modal_overlay.on("click", (e) => {
			if (e.target === this.$modal_overlay[0]) {
				this.toggle_modal(false);
			}
		});

		this.search_field.$input.on("input", (e) => {
			clearTimeout(this.last_search);
			this.last_search = setTimeout(() => {
				const search_term = e.target.value;
				this.filter_items({ search_term });
			}, 300);

			this.$clear_search_btn.toggle(Boolean(this.search_field.$input.val()));
		});

		this.search_field.$input.on("focus", () => {
			this.$clear_search_btn.toggle(Boolean(this.search_field.$input.val()));
		});
	}

	handle_item_click($item) {
		const item_code = unescape($item.attr("data-item-code"));
		let batch_no = unescape($item.attr("data-batch-no"));
		let serial_no = unescape($item.attr("data-serial-no"));
		let uom = unescape($item.attr("data-uom"));
		let rate = unescape($item.attr("data-rate"));
		let stock_uom = unescape($item.attr("data-stock-uom"));

		// escape(undefined) returns "undefined" then unescape returns "undefined"
		batch_no = batch_no === "undefined" ? undefined : batch_no;
		serial_no = serial_no === "undefined" ? undefined : serial_no;
		uom = uom === "undefined" ? undefined : uom;
		rate = rate === "undefined" ? undefined : rate;
		stock_uom = stock_uom === "undefined" ? undefined : stock_uom;

		this.events.item_selected({
			field: "qty",
			value: "+1",
			item: { item_code, batch_no, serial_no, uom, rate, stock_uom },
		});
		this.search_field.set_focus();
	}

	attach_shortcuts() {
		const ctrl_label = frappe.utils.is_mac() ? "⌘" : "Ctrl";
		this.search_field.parent.attr("title", `${ctrl_label}+I`);
		frappe.ui.keys.add_shortcut({
			shortcut: "ctrl+i",
			action: () => this.search_field.set_focus(),
			condition: () => this.$component.is(":visible"),
			description: __("Focus on search input"),
			ignore_inputs: true,
			page: cur_page.page.page,
		});
		this.item_group_field.parent.attr("title", `${ctrl_label}+G`);
		frappe.ui.keys.add_shortcut({
			shortcut: "ctrl+g",
			action: () => this.item_group_field.set_focus(),
			condition: () => this.$component.is(":visible"),
			description: __("Focus on Item Group filter"),
			ignore_inputs: true,
			page: cur_page.page.page,
		});

		// for selecting the last filtered item on search
		frappe.ui.keys.on("enter", () => {
			const selector_is_visible = this.$component.is(":visible");
			if (!selector_is_visible || this.search_field.get_value() === "") return;

			if (this.items.length == 1) {
				this.$items_container.find(".item-wrapper").click();
				frappe.utils.play_sound("submit");
				this.set_search_value("");
			} else if (this.items.length == 0 && this.barcode_scanned) {
				// only show alert of barcode is scanned and enter is pressed
				frappe.show_alert({
					message: __("No items found. Scan barcode again."),
					indicator: "orange",
				});
				frappe.utils.play_sound("error");
				this.barcode_scanned = false;
				this.set_search_value("");
			}
		});
	}

	filter_items({ search_term = "" } = {}) {
		const selling_price_list = this.events.get_frm().doc.selling_price_list;

		if (search_term) {
			search_term = search_term.toLowerCase();

			// memoize
			this.search_index = this.search_index || {};
			this.search_index[selling_price_list] = this.search_index[selling_price_list] || {};
			if (this.search_index[selling_price_list][search_term]) {
				const items = this.search_index[selling_price_list][search_term];
				this.items = items;
				this.render_item_list(items);
				this.auto_add_item &&
					this.search_field.$input[0].value &&
					this.items.length == 1 &&
					this.add_filtered_item_to_cart();
				return;
			}
		}

		this.get_items({ search_term }).then(({ message }) => {
			// eslint-disable-next-line no-unused-vars
			const { items, serial_no, batch_no, barcode } = message;
			if (search_term && !barcode) {
				this.search_index[selling_price_list][search_term] = items;
			}
			this.items = items;
			this.render_item_list(items);
			this.auto_add_item &&
				this.search_field.$input[0].value &&
				this.items.length == 1 &&
				this.add_filtered_item_to_cart();
		});
	}

	add_filtered_item_to_cart() {
		this.$items_container.find(".item-wrapper").click();
		this.set_search_value("");
	}

	resize_selector(minimize) {
		minimize
			? this.$component
				.find(".filter-section")
				.css("grid-template-columns", "repeat(1, minmax(0, 1fr))")
			: this.$component
				.find(".filter-section")
				.css("grid-template-columns", "repeat(12, minmax(0, 1fr))");

		minimize
			? this.$component.find(".search-field").css("margin", "var(--margin-sm) 0px")
			: this.$component.find(".search-field").css("margin", "0px var(--margin-sm)");

		minimize
			? this.$component.css("grid-column", "span 2 / span 2")
			: this.$component.css("grid-column", "span 6 / span 6");

		minimize
			? this.$items_container.css("grid-template-columns", "repeat(1, minmax(0, 1fr))")
			: this.$items_container.css("grid-template-columns", "repeat(4, minmax(0, 1fr))");
	}

	toggle_component(show) {
		this.set_search_value("");
		if (this.is_mobile_view()) {
			// In mobile view, always hide the main component
			this.$component.css("display", "none");
		} else {
			// In desktop view, show/hide normally
			this.$component.css("display", show ? "flex" : "none");
		}
	}

	toggle_modal(show) {
		if (show) {
			this.$modal_overlay.addClass("show");
			this.$modal_overlay.css("display", "");
			this.load_items_data(); // Refresh items in modal
		} else {
			this.$modal_overlay.css("display", "none");
			this.$modal_overlay.removeClass("show");
		}
	}

	is_mobile_view() {
		return window.innerWidth <= 620;
	}

	search_item(search_term) {
		if (search_term) {
			this.filter_items({ search_term });
		} else {
			this.load_items_data();
		}
	}
};
