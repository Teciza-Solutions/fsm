// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Maintenance Checklist", {
	refresh(frm) {
		frm.set_df_property("main_activities", "cannot_add_rows", true);
		highlight_divider_rows(frm);
	},
	main_activities_on_form_rendered(frm, cdt, cdn) {
		highlight_divider_rows(frm);
	}
});

frappe.ui.form.on("Maintenance Checklist Template Activity", {
	update(frm, cdt, cdn) {
		let row = locals[cdt][cdn];  // Get the selected parent activity row
		update_activity(frm, row);
	}
});

function update_activity(frm, parent_row) {
	if (parent_row.divider) {
		let d = new frappe.ui.Dialog({
			title: `Update Comments for Template: <b style="color:red;">${parent_row.activity}</b>`,
			size: "large",
			fields: [
				{
					fieldtype: "Small Text",
					fieldname: "comments",
					label: "Comments",
					reqd: 1,
					default: parent_row.comments,
				}
			],
			primary_action_label: "Update",
			primary_action(values) {
				if (values.comments) {
					frappe.model.set_value(parent_row.doctype, parent_row.name, "comments", values.comments)
					d.hide();
					frm.refresh_field("main_activities");
					frm.save();
				}
			}
		});

		d.show();
		return
	}

	frappe.db.get_value('Project', frm.doc.project, 'checklist_fields')
		.then(r => {
			let checklist_fields = [];

			if (r.message && r.message.checklist_fields) {
				checklist_fields = r.message.checklist_fields
					.split(',')
					.map(f => f.trim())
					.filter(f => f);
			} else {
				checklist_fields = [
					"clean",
					"check",
					"lubricate",
					"replace",
					"expired",
					"as_per_diagram"
				];
			}

			show_sub_activity_dialog(frm, parent_row, checklist_fields);
		});
}


function show_sub_activity_dialog(frm, parent_row, checklist_fields) {
	let sub_activities = frm.doc.sub_activities.filter(sa => sa.parent_activity === parent_row.activity);

	if (sub_activities.length === 0) {
		frappe.msgprint("No sub-activities found for this activity.");
		return;
	}

	let table_html = `
		<style>
			.table-responsive { width: 100%; overflow-x: auto; }
			table { width: 100%; border-collapse: collapse; text-align: center; table-layout: auto; }
			th, td { border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: middle; white-space: nowrap; }
			.rotate-header { writing-mode: vertical-rl; transform: rotate(180deg); width: 40px; padding: 5px; }
			.comments { width: 100%; height: 50px; resize: vertical; padding: 5px; border: none; border-radius: 4px; }
		</style>

		<div class="table-responsive">
			<table class="table table-bordered">
				<thead>
					<tr>
						<th style="text-align: left;">Sub Activity</th>`;

	checklist_fields.forEach(field => {
		let label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
		table_html += `<th class="rotate-header">${label}</th>`;
	});

	table_html += `<th>Comments</th></tr></thead><tbody>`;

	sub_activities.forEach(sub => {
		table_html += `<tr data-sub-id="${sub.name}">
			<td style="text-align: left;">${sub.activity}</td>`;

		checklist_fields.forEach(field => {
			table_html += `<td><input type="checkbox" class="${field}" ${sub[field] ? "checked" : ""}></td>`;
		});

		table_html += `<td><textarea class="comments">${sub.comments || ''}</textarea></td></tr>`;
	});

	table_html += `</tbody></table></div>`;

	let d = new frappe.ui.Dialog({
		title: `Update Sub-Activities for: <b style="color:red;">${parent_row.activity}</b>`,
		size: "extra-large",
		fields: [
			{ fieldtype: "HTML", fieldname: "sub_activity_table", options: table_html }
		],
		primary_action_label: "Update",
		primary_action() {
			const cdt = "Maintenance Checklist Template Sub Activity";

			cur_dialog.$wrapper.find('tr[data-sub-id]').each(function () {
				let sub_id = $(this).attr("data-sub-id");

				checklist_fields.forEach(field => {
					let value = $(this).find(`.${field}`).prop("checked") ? 1 : 0;
					frappe.model.set_value(cdt, sub_id, field, value);
				});

				let comments = $(this).find(".comments").val();
				frappe.model.set_value(cdt, sub_id, "comments", comments);
			});

			frm.save();
			d.hide();
			frm.refresh_field("sub_activities");
		}
	});

	d.show();
}

function highlight_divider_rows(frm) {
	frm.fields_dict["main_activities"].grid.grid_rows.forEach(row => {
		if (row.doc.divider) {
			// Apply styling to highlight the row
			$(row.wrapper).css({
				"background-color": "#ffeb3b",  // Yellow highlight
				"font-weight": "bold"
			});
		} else {
			// Reset styling for non-divider rows
			$(row.wrapper).css({
				"background-color": "",
				"font-weight": ""
			});
		}
	});
}


frappe.ui.form.on("Maintenance Checklist Item", {
	update: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.criteria) {
			frappe.throw(__("Please select a Criteria first!"));
		}
		update_criteria(frm, row);
	},
	duplicate(frm, cdt, cdn) {
		let row = locals[cdt][cdn];  // Get the selected parent component row
		if (!row.criteria) {
			frappe.throw(__("Please select a Criteria first!"));
		}
		duplicate_criteria(frm, row);
	}
});


async function duplicate_criteria(frm, parent_row) {
	const dialog = new frappe.ui.Dialog({
		title: __('Duplicate the Criteria'),
		fields: [
			{
				label: __('Criteria Name'),
				fieldname: 'new_criteria',
				fieldtype: 'Data',
				default: parent_row.criteria,
				reqd: 1,
			}
		],
		primary_action_label: __('Update'),
		primary_action(values) {
			if (values.new_criteria && values.new_criteria === parent_row.criteria) {
				frappe.throw(__("Cannot add same Criteria, criteria already exists"));
			}

			if (frm.doc.criterias && frm.doc.criterias.some(c => c.criteria === values.new_criteria)) {
				frappe.throw(__("Cannot add same Criteria, criteria already exists"));
			}

			frappe.dom.freeze(__("Duplicating criteria..."));

			frm.add_child("criterias", {
				"criteria": values.new_criteria,
				"parent1": parent_row.parent1,
				"has_comment": parent_row.has_comment || parent_row.has_comments || 0,
				"has_comments": parent_row.has_comments || parent_row.has_comment || 0,
				"checklist_template": parent_row.checklist_template || frm.doc.checklist_template || "",
			});

			let header_items = (frm.doc.values || []).filter(e =>
				e.description === parent_row.criteria &&
				(e.parent1 === parent_row.parent1 || e.has_comments) &&
				(!parent_row.checklist_template || e.checklist_template === parent_row.checklist_template)
			);
			header_items.forEach(e => {
				frm.add_child("values", {
					"description": values.new_criteria,
					"column": e.column,
					"column_field_type": e.column_field_type,
					"parent1": e.parent1,
					"main_parent": e.main_parent,
					"has_comments": e.has_comments,
					"value": e.value,
					"checklist_template": e.checklist_template || parent_row.checklist_template || frm.doc.checklist_template || "",
				});
			});

			let sub_items = (frm.doc.values || []).filter(e =>
				e.parent1 === parent_row.criteria &&
				(!parent_row.checklist_template || e.checklist_template === parent_row.checklist_template)
			);
			sub_items.forEach(e => {
				frm.add_child("values", {
					"description": e.description,
					"column": e.column,
					"column_field_type": e.column_field_type,
					"parent1": values.new_criteria,
					"main_parent": (e.main_parent === parent_row.criteria) ? values.new_criteria : e.main_parent,
					"has_comments": e.has_comments,
					"value": e.value,
					"checklist_template": e.checklist_template || parent_row.checklist_template || frm.doc.checklist_template || "",
				});
			});

			frm.dirty();
			frm.save().then(() => {
				frm.refresh_field("criterias");
				frm.refresh_field("values");
				frappe.show_alert({ message: __("Criteria duplicated successfully"), indicator: "green" });
			});

			frappe.dom.unfreeze();
			dialog.hide();
		},
		secondary_action_label: __('Cancel'),
		secondary_action() {
			dialog.hide();
		}
	});
	dialog.show();
}


function update_criteria(frm, row) {
	const selected_criteria = row.criteria;
	const parent_criteria = row.parent1;
	const all_values = frm.doc.values || [];
	const sub_items = all_values.filter(v => v.parent1 === selected_criteria);

	const columns = (frm.doc.columns || []).filter(c => parseInt(c.not_input_field) !== 1);
	const firstcol_name_of_checklist = frm.doc.columns[0].column_name;

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
		
		/* Font size increased for better readability */
		#${scope_id} .sub-table th, #${scope_id} .sub-table td { 
			border: 1px solid #ebeef0; padding: 10px 12px; font-size: 13px; 
		}
		
		#${scope_id} .sub-table thead th { 
			position: sticky; top: 0; background: #f8f9fa; z-index: 30;
			font-weight: 700; text-align: center; border-bottom: 2px solid #d1d8dd;
		}

		/* SNo Column Sticky */
		#${scope_id} .sticky-sno {
			position: sticky; left: 0; background: #f8f9fa !important; z-index: 31;
			width: 50px; text-align: center; font-weight: 700;
			border-right: 1px solid #d1d8dd !important;
		}

		/* Criteria Column Sticky - Adjusted Left to account for SNo */
		#${scope_id} .sticky-col { 
			position: sticky; left: 50px; background: #fff !important; z-index: 29;
			min-width: 350px; max-width: 350px; font-weight: 600; 
			border-right: 2px solid #d1d8dd !important;
			white-space: normal; word-break: break-word;
			font-size: 14px; /* Bigger font for criteria */
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
						<th class="sticky-sno">SNo.</th>
						<th class="sticky-col">${firstcol_name_of_checklist}</th>
						${columns.map(col => `
							<th class="${col.rotate ? 'rotate-header' : ''}">
								${col.rotate ? `<span>${col.column_name}</span>` : col.column_name}
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
				<td class="sticky-col">${task}</td>
		`;

		columns.forEach(col => {
			const item_row = item_map[`${task}||${col.column_name}`];
			table_html += `<td>`;
			if (item_row) {
				const val = item_row.value || "";
				const row_id = item_row.name;

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
					table_html += `<input type="text" class="grid-input" data-row-id="${row_id}" value="${val}">`;
				}
			}
			table_html += `</td>`;
		});
		table_html += `</tr>`;
	});

	table_html += `</tbody></table></div></div>`;

	let d = new frappe.ui.Dialog({
		title: parent_criteria
			? __("<b>{0}</b> - <span style='color: red;'>({1})</span>", [selected_criteria, parent_criteria])
			: __("<b>{0}</b>", [selected_criteria]),
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "grid_html", options: table_html }],
		primary_action_label: __("Update"),
		primary_action() {
			const $wrapper = d.$wrapper;
			let has_updates = false;

			// Update Text and Select
			$wrapper.find('input[data-row-id]:not([type="checkbox"]), select[data-row-id]').each(function () {
				const row_id = $(this).attr("data-row-id");
				const new_val = $(this).val();
				frappe.model.set_value("Maintenance Checklist Item Value", row_id, "value", new_val);
				has_updates = true;
			});

			// Update Checkboxes
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