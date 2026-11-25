// Copyright (c) 2026, Teciza Solutions and contributors
// For license information, please see license.txt

frappe.ui.form.on("Multi Checklist", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Update Checklist"), function () {
				show_template_tabs_dialog(frm);
			});

			frm.add_custom_button(__("Attach Images"), function () {
				open_image_dialog("Images", "images", frm);
			}, __("Actions"));
		}
	},
	update_checklist(frm) {
		show_template_tabs_dialog(frm);
	},
	upload_images(frm) {
		open_image_dialog("Images", "images", frm);
	}
});

frappe.ui.form.on("Maintenance Checklist Item", {
	update: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.criteria) {
			frappe.throw(__("Please select a Criteria first!"));
		}
		open_single_criteria_dialog(frm, row);
	}
});

frappe.ui.form.on("Multi Checklist Image", {
	preview: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.image) {
			frappe.msgprint(__("No image to preview."));
			return;
		}

		frappe.msgprint({
			title: __("Image Preview"),
			indicator: "blue",
			message: `<div style="text-align: center; padding: 10px;">
						<img src="${frappe.utils.escape_html(row.image)}" style="max-width: 100%; max-height: 80vh; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); border: 1px solid #e2e8f0;" />
					  </div>`,
			wide: true
		});
	}
});

/**
 * Extract unique checklist templates configured on this Multi Checklist
 */
function get_templates(frm) {
	let templates = [];
	if (frm.doc.checklist_templates && frm.doc.checklist_templates.length) {
		templates = frm.doc.checklist_templates.map(t => t.template).filter(Boolean);
	}
	if (!templates.length && frm.doc.criterias && frm.doc.criterias.length) {
		templates = [...new Set(frm.doc.criterias.map(c => c.checklist_template).filter(Boolean))];
	}
	return [...new Set(templates)];
}

/**
 * Calculate progress (completed / total items) for a criteria
 */
function get_criteria_progress(frm, template, criteria_name) {
	const all_values = frm.doc.values || [];
	const sub_items = all_values.filter(v =>
		v.parent1 === criteria_name &&
		(!template || v.checklist_template === template)
	);

	const input_columns = (frm.doc.columns || []).filter(c =>
		parseInt(c.not_input_field) !== 1 &&
		(!template || c.checklist_template === template)
	).map(c => c.column_name);

	const checkable_items = sub_items.filter(v => input_columns.includes(v.column));
	const total = checkable_items.length;
	const completed = checkable_items.filter(v => v.value !== undefined && v.value !== null && v.value.toString().trim() !== "").length;

	return { total, completed };
}

/**
 * Main Template-Wise Dialog with Tabs and Criteria List (Enlarged Full-Screen)
 */
function show_template_tabs_dialog(frm) {
	if (frm.is_new()) {
		frappe.msgprint(__("Please save the document first before updating checklists."));
		return;
	}

	const templates = get_templates(frm);
	if (!templates.length) {
		frappe.msgprint(__("No checklist templates found in this document."));
		return;
	}

	const scope_id = "multichk-tabs-" + frappe.utils.get_random(5);
	let active_template_idx = 0;

	let d = new frappe.ui.Dialog({
		title: __("<b>Update Checklist</b>"),
		size: "extra-large",
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "content_html"
			}
		],
		primary_action_label: __("Done"),
		primary_action() {
			d.hide();
		}
	});

	// Make dialog noticeably bigger (nearly full-screen width & height)
	d.$wrapper.find('.modal-dialog').css({
		'max-width': '86vw',
		'width': '86vw',
		'margin': '1.5vh auto'
	});
	d.$wrapper.find('.modal-content').css({
		'min-height': '92vh',
		'max-height': '96vh',
		'display': 'flex',
		'flex-direction': 'column'
	});
	d.$wrapper.find('.modal-body').css({
		'max-height': 'calc(94vh - 120px)',
		'overflow-y': 'auto',
		'padding': '16px 24px'
	});

	d.show();

	const $wrapper = d.fields_dict.content_html.$wrapper;

	function render_tabs_container() {
		const current_template = templates[active_template_idx];
		const template_criterias = (frm.doc.criterias || []).filter(c => c.checklist_template === current_template);

		let tabs_nav_html = `
			<ul class="nav nav-pills template-tabs-nav" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">
				${templates.map((t, idx) => {
			const count = (frm.doc.criterias || []).filter(c => c.checklist_template === t).length;
			const is_active = idx === active_template_idx;
			return `
						<li class="nav-item">
							<a href="javascript:void(0);" class="nav-link template-tab-btn ${is_active ? 'active' : ''}" data-idx="${idx}"
							   style="display: flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 20px; font-weight: ${is_active ? '600' : '500'}; background: ${is_active ? '#1e293b' : '#f1f5f9'}; color: ${is_active ? '#ffffff' : '#475569'}; text-decoration: none; cursor: pointer; transition: all 0.2s;">
								<i class="fa fa-clipboard"></i>
								<span style="font-size: 14px;">${frappe.utils.escape_html(t)}</span>
								<span class="badge ${is_active ? 'badge-light text-dark' : 'badge-secondary'}" style="font-size: 11px;">${count}</span>
							</a>
						</li>
					`;
		}).join("")}
			</ul>
		`;

		let criteria_cards_html = "";
		if (!template_criterias.length) {
			criteria_cards_html = `
				<div class="text-center text-muted p-5" style="background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
					<i class="fa fa-folder-open-o fa-2x mb-2" style="color: #94a3b8;"></i>
					<p class="mb-0">${__("No criteria found for template:")} <b>${frappe.utils.escape_html(current_template)}</b></p>
				</div>
			`;
		} else {
			criteria_cards_html = `
				<div class="table-responsive" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
					<table class="table table-hover mb-0" style="background: #ffffff;">
						<thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
							<tr>
								<th style="width: 50px; text-align: center;">${__("#")}</th>
								<th style="min-width: 300px;">${__("Criteria")}</th>
								<th style="width: 180px; text-align: center;">${__("Status")}</th>
								<th style="min-width: 250px;">${__("Comments")}</th>
								<th style="width: 130px; text-align: center;">${__("Action")}</th>
							</tr>
						</thead>
						<tbody>
							${template_criterias.map((c, c_idx) => {
				const progress = get_criteria_progress(frm, current_template, c.criteria);
				let status_badge = "";
				if (progress.total === 0) {
					status_badge = `<span class="badge badge-light text-muted">${__("No Items")}</span>`;
				} else if (progress.completed >= progress.total) {
					status_badge = `<span class="badge badge-success" style="padding: 6px 12px; font-size: 12px;"><i class="fa fa-check"></i> ${__("Completed")} (${progress.completed}/${progress.total})</span>`;
				} else if (progress.completed > 0) {
					status_badge = `<span class="badge badge-warning" style="padding: 6px 12px; font-size: 12px;">${progress.completed}/${progress.total} ${__("Done")}</span>`;
				} else {
					status_badge = `<span class="badge badge-secondary" style="padding: 6px 12px; font-size: 12px;">${__("Pending")} (0/${progress.total})</span>`;
				}

				return `
									<tr data-criteria-name="${frappe.utils.escape_html(c.name)}" data-criteria-idx="${c_idx}">
										<td style="text-align: center; vertical-align: middle; font-weight: 600; color: #64748b;">${c_idx + 1}</td>
										<td style="vertical-align: middle;">
											<div style="font-weight: 600; font-size: 14px; color: #1e293b;">
												${frappe.utils.escape_html(c.criteria)}
											</div>
											${c.parent1 ? `<small class="text-muted"><i class="fa fa-level-up fa-rotate-90"></i> ${frappe.utils.escape_html(c.parent1)}</small>` : ""}
										</td>
										<td style="text-align: center; vertical-align: middle;">
											${status_badge}
										</td>
										<td style="vertical-align: middle;">
											<div class="text-muted text-truncate" style="max-width: 320px; font-size: 13px;">
												${c.comments ? frappe.utils.escape_html(c.comments) : '<span style="font-style: italic; color: #94a3b8;">' + __("No comments") + '</span>'}
											</div>
										</td>
										<td style="text-align: center; vertical-align: middle;">
											<button class="btn btn-sm btn-primary btn-open-criteria-grid" data-criteria-idx="${c_idx}"
													style="display: inline-flex; align-items: center; gap: 6px; font-weight: 500; padding: 5px 14px;">
												<i class="fa fa-pencil"></i>
												<span>${__("Update")}</span>
											</button>
										</td>
									</tr>
								`;
			}).join("")}
						</tbody>
					</table>
				</div>
			`;
		}

		$wrapper.html(`
			<div id="${scope_id}">
				${tabs_nav_html}
				<div class="template-criteria-content">
					${criteria_cards_html}
				</div>
			</div>
		`);

		// Tab click event
		$wrapper.find(".template-tab-btn").on("click", function () {
			active_template_idx = parseInt($(this).attr("data-idx"));
			render_tabs_container();
		});

		// Open criteria grid view
		$wrapper.find(".btn-open-criteria-grid").on("click", function () {
			const c_idx = parseInt($(this).attr("data-criteria-idx"));
			render_criteria_grid(current_template, template_criterias, c_idx);
		});
	}

	/**
	 * Render Grid for a specific Criteria inside the enlarged dialog
	 */
	function render_criteria_grid(current_template, template_criterias, c_idx) {
		const criteria_row = template_criterias[c_idx];
		const selected_criteria = criteria_row.criteria;
		const parent_criteria = criteria_row.parent1;

		const all_values = frm.doc.values || [];
		const sub_items = all_values.filter(v =>
			v.parent1 === selected_criteria &&
			(!current_template || v.checklist_template === current_template)
		);

		const columns = (frm.doc.columns || []).filter(c =>
			parseInt(c.not_input_field) !== 1 &&
			(!current_template || c.checklist_template === current_template)
		);

		const firstcol_name = columns.length > 0 && columns[0].column_name
			? columns[0].column_name
			: __("Description");

		const tasks = [...new Set(sub_items.map(v => v.description))];
		const item_map = {};
		sub_items.forEach(v => {
			item_map[`${v.description}||${v.column}`] = v;
		});

		const grid_scope = "grid-scope-" + frappe.utils.get_random(5);

		let grid_html = `
			<style>
				#${grid_scope} .grid-table-container {
					width: 100%;
					max-height: 64vh;
					overflow: auto;
					border: 1px solid #cbd5e1;
					border-radius: 6px;
					margin-bottom: 14px;
				}
				#${grid_scope} .sub-table {
					width: 100%;
					border-collapse: separate;
					border-spacing: 0;
					background: #fff;
				}
				#${grid_scope} .sub-table th, #${grid_scope} .sub-table td {
					border: 1px solid #e2e8f0;
					padding: 9px 12px;
					font-size: 13px;
				}
				#${grid_scope} .sub-table thead th {
					position: sticky;
					top: 0;
					background: #f8fafc;
					z-index: 30;
					font-weight: 700;
					text-align: center;
					border-bottom: 2px solid #cbd5e1;
				}
				#${grid_scope} .sticky-sno {
					position: sticky;
					left: 0;
					background: #f8fafc !important;
					z-index: 31;
					width: 48px;
					text-align: center;
					font-weight: 700;
					border-right: 1px solid #cbd5e1 !important;
				}
				#${grid_scope} .sticky-desc {
					position: sticky;
					left: 48px;
					background: #fff !important;
					z-index: 29;
					min-width: 380px;
					max-width: 420px;
					font-weight: 600;
					border-right: 2px solid #cbd5e1 !important;
					white-space: normal;
					word-break: break-word;
					font-size: 13px;
				}
				#${grid_scope} .rotate-header {
					height: 110px;
					vertical-align: bottom;
				}
				#${grid_scope} .rotate-header span {
					writing-mode: vertical-rl;
					transform: rotate(180deg);
					white-space: nowrap;
					display: inline-block;
					padding-bottom: 4px;
				}
				#${grid_scope} .grid-input {
					width: 100%;
					border: 1px solid #cbd5e1;
					border-radius: 4px;
					padding: 5px 8px;
					font-size: 13px;
					height: 33px;
				}
			</style>

			<div id="${grid_scope}">
				<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
					<div>
						<button class="btn btn-sm btn-default btn-back-to-criterias" style="margin-right: 12px;">
							<i class="fa fa-arrow-left"></i> ${__("Back to Criteria List")}
						</button>
						<span style="font-size: 16px; font-weight: 600; color: #0f172a;">
							<span class="text-primary">[${frappe.utils.escape_html(current_template)}]</span>
							${frappe.utils.escape_html(selected_criteria)}
							${parent_criteria ? `<small class="text-danger">(${frappe.utils.escape_html(parent_criteria)})</small>` : ""}
						</span>
					</div>
					<div class="text-muted" style="font-size: 13px; font-weight: 500;">
						${__("Criteria")} <b>${c_idx + 1}</b> ${__("of")} <b>${template_criterias.length}</b>
					</div>
				</div>

				<div class="grid-table-container">
					<table class="sub-table">
						<thead>
							<tr>
								<th class="sticky-sno">${__("SNo.")}</th>
								<th class="sticky-desc">${frappe.utils.escape_html(firstcol_name)}</th>
								${columns.map(col => `
									<th class="${col.rotate ? 'rotate-header' : ''}">
										${col.rotate ? `<span>${frappe.utils.escape_html(col.column_name)}</span>` : frappe.utils.escape_html(col.column_name)}
									</th>
								`).join('')}
							</tr>
						</thead>
						<tbody>
							${tasks.length === 0 ? `
								<tr><td colspan="${columns.length + 2}" class="text-center text-muted p-4">${__("No checklist items configured for this criteria.")}</td></tr>
							` : tasks.map((task, idx) => `
								<tr>
									<td class="sticky-sno">${idx + 1}</td>
									<td class="sticky-desc">${frappe.utils.escape_html(task)}</td>
									${columns.map(col => {
			const item_row = item_map[`${task}||${col.column_name}`];
			if (!item_row) return `<td></td>`;

			const val = item_row.value || "";
			const row_id = frappe.utils.escape_html(item_row.name);

			if (col.field_type === "Check") {
				return `
												<td style="text-align: center;">
													<input type="checkbox" class="grid-input-check" data-row-id="${row_id}"
														   style="width: 19px; height: 19px; cursor: pointer;" ${val == "1" ? "checked" : ""}>
												</td>
											`;
			} else if (col.field_type === "Select") {
				return `
												<td>
													<select class="grid-input" data-row-id="${row_id}">
														<option value=""></option>
														<option value="OK" ${val === "OK" ? "selected" : ""}>OK</option>
														<option value="Not OK" ${val === "Not OK" ? "selected" : ""}>Not OK</option>
														<option value="N/A" ${val === "N/A" ? "selected" : ""}>N/A</option>
													</select>
												</td>
											`;
			} else {
				return `
												<td>
													<input type="text" class="grid-input" data-row-id="${row_id}" value="${frappe.utils.escape_html(val)}">
												</td>
											`;
			}
		}).join('')}
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>

				<div style="margin-bottom: 14px;">
					<label style="font-weight: 600; font-size: 13px; color: #334155; margin-bottom: 4px;">${__("Comments for this Criteria:")}</label>
					<textarea class="form-control criteria-comments-box" rows="2" placeholder="${__("Add comments or remarks for {0}...", [selected_criteria])}"
							  style="font-size: 13px; resize: vertical;">${criteria_row.comments ? frappe.utils.escape_html(criteria_row.comments) : ""}</textarea>
				</div>

				<div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 14px;">
					<button class="btn btn-sm btn-default btn-back-to-criterias">
						<i class="fa fa-arrow-left"></i> ${__("Back")}
					</button>
					<div style="display: flex; gap: 8px;">
						<button class="btn btn-sm btn-primary btn-save-grid-data" style="font-weight: 500; padding: 6px 16px;">
							<i class="fa fa-check"></i> ${__("Save")}
						</button>
						${c_idx + 1 < template_criterias.length ? `
							<button class="btn btn-sm btn-info btn-save-and-next-grid" style="font-weight: 500; padding: 6px 16px;">
								<span>${__("Save & Next Criteria")}</span>
								<i class="fa fa-arrow-right"></i>
							</button>
						` : ""}
					</div>
				</div>
			</div>
		`;

		$wrapper.html(grid_html);

		function save_grid_data() {
			let has_updates = false;

			// Text & Select inputs
			$wrapper.find('input[data-row-id]:not([type="checkbox"]), select[data-row-id]').each(function () {
				const row_id = $(this).attr("data-row-id");
				const new_val = $(this).val();
				frappe.model.set_value("Maintenance Checklist Item Value", row_id, "value", new_val);
				has_updates = true;
			});

			// Checkboxes
			$wrapper.find('input.grid-input-check[data-row-id]').each(function () {
				const row_id = $(this).attr("data-row-id");
				const new_val = $(this).is(":checked") ? "1" : "0";
				frappe.model.set_value("Maintenance Checklist Item Value", row_id, "value", new_val);
				has_updates = true;
			});

			// Comments
			const new_comments = $wrapper.find(".criteria-comments-box").val();
			if (criteria_row.name) {
				frappe.model.set_value("Maintenance Checklist Item", criteria_row.name, "comments", new_comments);
				has_updates = true;
			}

			if (has_updates) {
				frm.refresh_field("values");
				frm.refresh_field("criterias");
				frm.save();
				frappe.show_alert({ message: __("Checklist updated & saved"), indicator: "green" });
			}
		}

		$wrapper.find(".btn-back-to-criterias").on("click", function () {
			render_tabs_container();
		});

		$wrapper.find(".btn-save-grid-data").on("click", function () {
			save_grid_data();
			render_tabs_container();
		});

		$wrapper.find(".btn-save-and-next-grid").on("click", function () {
			save_grid_data();
			if (c_idx + 1 < template_criterias.length) {
				render_criteria_grid(current_template, template_criterias, c_idx + 1);
			} else {
				render_tabs_container();
			}
		});
	}

	render_tabs_container();
}

/**
 * Image Dialog for uploading multiple images, viewing, and rotating (same as PM Checklist)
 */
function open_image_dialog(section, fieldname, frm) {
	let dialog;

	let image_rows = (frm.doc[fieldname] || []).map(row => ({
		image: row.image,
		name: row.name
	}));

	dialog = new frappe.ui.Dialog({
		title: __("Attach {0}", [section]),
		fields: [
			{
				label: __("Images"),
				fieldname: "images",
				fieldtype: "Table",
				cannot_add_rows: true,
				in_place_edit: false,
				fields: [
					{
						fieldtype: "Attach Image",
						fieldname: "image",
						label: __("Image"),
						reqd: 1,
						in_list_view: 1
					}
				]
			},
			{
				fieldtype: "Section Break",
				fieldname: "section_brk"
			},
			{
				fieldtype: "Button",
				label: __("Upload Images"),
				fieldname: "upload_images",
				click: () => {
					new frappe.ui.FileUploader({
						allow_multiple: true,
						on_success(file) {
							image_rows.push({
								image: file.file_url,
								caption: file.name
							});
							dialog.set_value("images", image_rows);
							dialog.fields_dict.images.df.data = image_rows;
							dialog.fields_dict.images.grid.refresh();
						}
					});
				}
			},
			{
				fieldtype: "Column Break",
				fieldname: "column_brk"
			},
			{
				fieldtype: "Button",
				label: __("View Images"),
				fieldname: "view_images",
				click: () => {
					if (!image_rows.length) {
						frappe.msgprint(__("No images uploaded yet."));
						return;
					}

					open_view_and_rotate_dialog(image_rows, frm, dialog, section);
				}
			}
		],
		primary_action_label: __("Save"),
		primary_action(values) {
			frm.clear_table(fieldname);

			(values.images || []).forEach(row => {
				if (row.image) {
					frm.add_child(fieldname, {
						image: row.image
					});
				}
			});

			frm.refresh_field(fieldname);
			frm.save();
			dialog.hide();
		}
	});

	dialog.set_value("images", image_rows);
	dialog.fields_dict.images.df.data = image_rows;
	dialog.fields_dict.images.grid.refresh();
	dialog.show();
}

/**
 * View & Rotate Images Dialog with canvas-based 90-degree rotation and backend file overwrite
 */
function open_view_and_rotate_dialog(image_rows, frm, parent_dialog, section) {
	const wrapper_id = `img-dialog-${Math.random().toString(36).substring(2, 10)}`;
	const wrapper = $(`
		<div id="${wrapper_id}" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; padding: 12px; max-height: 75vh; overflow-y: auto;">
			${image_rows.map((img, index) => `
				<div style="position: relative; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
					<div style="display: flex; justify-content: center; align-items: center; min-height: 250px; max-height: 480px; overflow: hidden; background: #f8fafc; border-radius: 6px;">
						<img
							src="${frappe.utils.escape_html(img.image)}"
							style="max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 4px; transition: transform 0.3s ease;"
							data-index="${index}"
							data-rotation="0"
						/>
					</div>
					<button class="btn btn-xs btn-default rotate-btn"
						data-target-index="${index}"
						style="position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.95); border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
						<i class="fa fa-repeat"></i> ⤾ ${__("Rotate")}
					</button>
				</div>
			`).join("")}
		</div>
		<div style="margin-top: 18px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 14px;">
			<button class="btn btn-primary save-rotated-images" style="font-weight: 500; padding: 8px 20px;">
				<i class="fa fa-save"></i> ${__("Save Rotated Images")}
			</button>
		</div>
	`);

	const sub_dialog = new frappe.ui.Dialog({
		title: __("{0} Images - View & Rotate", [section || __("Multi Checklist")]),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "image_html",
				options: wrapper.prop("outerHTML")
			}
		],
		size: "extra-large"
	});

	sub_dialog.$wrapper.find('.modal-dialog').css({
		'max-width': '92vw',
		'width': '92vw',
		'margin': '2vh auto'
	});

	sub_dialog.show();

	setTimeout(() => {
		$(`#${wrapper_id} .rotate-btn`).on("click", function () {
			const index = $(this).data("target-index");
			const img = $(`#${wrapper_id} img[data-index="${index}"]`);
			let current = parseInt(img.attr("data-rotation") || 0);
			const next = (current + 90) % 360;
			img.css("transform", `rotate(${next}deg)`);
			img.attr("data-rotation", next);
		});

		$(`#${wrapper_id} .save-rotated-images`).on("click", function () {
			const promises = [];
			frappe.show_alert({ message: __("Rotating and saving images..."), indicator: "blue" });

			$(`#${wrapper_id} img`).each(function () {
				const img = $(this);
				const rotation = parseInt(img.attr("data-rotation") || 0);
				const index = parseInt(img.attr("data-index"));

				if (rotation !== 0) {
					const tempImage = new Image();
					tempImage.crossOrigin = "anonymous";
					tempImage.src = img.attr("src");

					const p = new Promise((resolve, reject) => {
						tempImage.onload = function () {
							const canvas = document.createElement("canvas");
							const ctx = canvas.getContext("2d");

							const maxWidth = 1920;
							const maxHeight = 1920;

							let width = tempImage.width;
							let height = tempImage.height;

							if (width > maxWidth || height > maxHeight) {
								const ratio = Math.min(maxWidth / width, maxHeight / height);
								width = width * ratio;
								height = height * ratio;
							}

							canvas.width = rotation % 180 === 0 ? width : height;
							canvas.height = rotation % 180 === 0 ? height : width;

							ctx.translate(canvas.width / 2, canvas.height / 2);
							ctx.rotate((rotation * Math.PI) / 180);
							ctx.drawImage(tempImage, -width / 2, -height / 2, width, height);

							canvas.toBlob(blob => {
								const file = new File([blob], `rotated_${Date.now()}.png`, { type: "image/png" });
								const reader = new FileReader();
								reader.onload = function (event) {
									const base64 = event.target.result.split(",")[1];
									frm.call({
										method: "replace_existing_file",
										doc: frm.doc,
										args: {
											file_url: image_rows[index].image,
											filedata_base64: base64
										},
										callback: (r) => {
											if (!r.exc) {
												resolve();
											} else {
												reject(r.exc);
											}
										}
									});
								};
								reader.readAsDataURL(file);
							}, "image/png");
						};

						tempImage.onerror = function (err) {
							reject(err);
						};
					});

					promises.push(p);
				}
			});

			if (!promises.length) {
				frappe.msgprint(__("No images were rotated."));
				return;
			}

			Promise.all(promises)
				.then(() => {
					frappe.show_alert({ message: __("All rotated images saved successfully!"), indicator: "green" });
					sub_dialog.hide();
					if (parent_dialog) {
						parent_dialog.set_value("images", image_rows);
						parent_dialog.fields_dict.images.df.data = image_rows;
						parent_dialog.fields_dict.images.grid.refresh();
					}
					frm.refresh_field("images");
				})
				.catch(err => {
					console.error(err);
					frappe.msgprint(__("Failed to save some rotated images."));
				});
		});
	}, 200);
}

/**
 * Fallback dialog when user clicks "Update" on a single criteria row in the form table
 */
function open_single_criteria_dialog(frm, row) {
	const selected_criteria = row.criteria;
	const parent_criteria = row.parent1;
	const template_name = row.checklist_template;
	const all_values = frm.doc.values || [];

	const sub_items = all_values.filter(v =>
		v.parent1 === selected_criteria &&
		(!template_name || v.checklist_template === template_name)
	);

	const columns = (frm.doc.columns || []).filter(c =>
		parseInt(c.not_input_field) !== 1 &&
		(!template_name || c.checklist_template === template_name)
	);

	const firstcol_name = columns.length > 0 && columns[0].column_name
		? columns[0].column_name
		: __("Description");

	if (sub_items.length === 0) {
		frappe.msgprint(__("No sub-items found for {0}", [selected_criteria]));
		return;
	}

	const tasks = [...new Set(sub_items.map(v => v.description))];
	const item_map = {};
	sub_items.forEach(v => {
		item_map[`${v.description}||${v.column}`] = v;
	});

	const scope_id = "checklist-dialog-" + frappe.utils.get_random(5);

	let table_html = `
	<style>
		#${scope_id} .table-wrapper {
			width: 100%;
			max-height: 65vh;
			overflow: auto;
			border: 1px solid #d1d8dd;
		}
		#${scope_id} .sub-table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; }
		#${scope_id} .sub-table th, #${scope_id} .sub-table td {
			border: 1px solid #ebeef0; padding: 10px 12px; font-size: 13px;
		}
		#${scope_id} .sub-table thead th {
			position: sticky; top: 0; background: #f8f9fa; z-index: 30;
			font-weight: 700; text-align: center; border-bottom: 2px solid #d1d8dd;
		}
		#${scope_id} .sticky-sno {
			position: sticky; left: 0; background: #f8f9fa !important; z-index: 31;
			width: 50px; text-align: center; font-weight: 700;
			border-right: 1px solid #d1d8dd !important;
		}
		#${scope_id} .sticky-col {
			position: sticky; left: 50px; background: #fff !important; z-index: 29;
			min-width: 350px; max-width: 350px; font-weight: 600;
			border-right: 2px solid #d1d8dd !important;
			white-space: normal; word-break: break-word;
			font-size: 14px;
		}
		#${scope_id} .grid-input {
			width: 100%; border: 1px solid #d1d8dd; border-radius: 4px; padding: 6px;
			font-size: 13px; height: 34px; font-weight: 500;
		}
		#${scope_id} .rotate-header { height: 120px; vertical-align: bottom; }
		#${scope_id} .rotate-header span {
			writing-mode: vertical-rl; transform: rotate(180deg);
			white-space: nowrap; display: inline-block; padding-bottom: 5px;
		}
	</style>
	<div id="${scope_id}">
		<div class="table-wrapper">
			<table class="sub-table">
				<thead>
					<tr>
						<th class="sticky-sno">${__("SNo.")}</th>
						<th class="sticky-col">${frappe.utils.escape_html(firstcol_name)}</th>
						${columns.map(col => `
							<th class="${col.rotate ? 'rotate-header' : ''}">
								${col.rotate ? `<span>${frappe.utils.escape_html(col.column_name)}</span>` : frappe.utils.escape_html(col.column_name)}
							</th>
						`).join('')}
					</tr>
				</thead>
				<tbody>
	`;

	tasks.forEach((task, index) => {
		table_html += `
			<tr>
				<td class="sticky-sno">${index + 1}</td>
				<td class="sticky-col">${frappe.utils.escape_html(task)}</td>
		`;

		columns.forEach(col => {
			const item_row = item_map[`${task}||${col.column_name}`];
			table_html += `<td>`;
			if (item_row) {
				const val = item_row.value || "";
				const row_id = frappe.utils.escape_html(item_row.name);

				if (col.field_type === "Check") {
					table_html += `
						<div style="text-align:center;">
							<input type="checkbox" class="grid-input-check" data-row-id="${row_id}"
							style="width:20px; height:20px;" ${val == "1" ? "checked" : ""}>
						</div>`;
				} else if (col.field_type === "Select") {
					table_html += `
						<select class="grid-input" data-row-id="${row_id}">
							<option value=""></option>
							<option value="OK" ${val === "OK" ? "selected" : ""}>OK</option>
							<option value="Not OK" ${val === "Not OK" ? "selected" : ""}>Not OK</option>
							<option value="N/A" ${val === "N/A" ? "selected" : ""}>N/A</option>
						</select>`;
				} else {
					table_html += `<input type="text" class="grid-input" data-row-id="${row_id}" value="${frappe.utils.escape_html(val)}">`;
				}
			}
			table_html += `</td>`;
		});
		table_html += `</tr>`;
	});

	table_html += `</tbody></table></div></div>`;

	let title_parts = [];
	if (template_name) {
		title_parts.push(`<span class="text-primary">[${frappe.utils.escape_html(template_name)}]</span>`);
	}
	title_parts.push(`<b>${frappe.utils.escape_html(selected_criteria)}</b>`);
	if (parent_criteria) {
		title_parts.push(`<span style='color: red;'>(${frappe.utils.escape_html(parent_criteria)})</span>`);
	}

	let d = new frappe.ui.Dialog({
		title: title_parts.join(" - "),
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "grid_html", options: table_html }],
		primary_action_label: __("Update"),
		primary_action() {
			const $wrapper = d.$wrapper;
			let has_updates = false;

			$wrapper.find('input[data-row-id]:not([type="checkbox"]), select[data-row-id]').each(function () {
				const row_id = $(this).attr("data-row-id");
				const new_val = $(this).val();
				frappe.model.set_value("Maintenance Checklist Item Value", row_id, "value", new_val);
				has_updates = true;
			});

			$wrapper.find('input.grid-input-check[data-row-id]').each(function () {
				const row_id = $(this).attr("data-row-id");
				const new_val = $(this).is(":checked") ? "1" : "0";
				frappe.model.set_value("Maintenance Checklist Item Value", row_id, "value", new_val);
				has_updates = true;
			});

			if (has_updates) {
				frm.refresh_field("values");
				frm.save();
				frappe.show_alert({ message: __("Checklist updated and saved"), indicator: "green" });
			}
			d.hide();
		}
	});

	d.show();
}
