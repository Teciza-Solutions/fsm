// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Schedule Cabinet", {
	refresh: function(frm) {
		if (frm.is_new()) {
			frm.set_value("fiscal_year", erpnext.utils.get_fiscal_year(frappe.datetime.get_today()))
		}
		
		if (frm.doc.docstatus == 1) {
			frm.add_custom_button(__('Change Team'), function () {
				frappe.prompt(
					{
						label: 'New Team',
						fieldname: 'team',
						fieldtype: 'Link',
						options: 'Team',
						reqd: 1
					},
					function(values) {
						frm.call({
							method: "change_team",
							doc: frm.doc,
							args: { team: values.team},
							callback: function () {
								frm.reload_doc();
							}
						});
					},
					__('Select New Team'),
					__('Assign')
				);
			}).addClass("btn-primary");

			if (frm.doc.multiple_assets) {
				frm.add_custom_button(__('Update Checklist'), function () {
					update_activity(frm);
				}).addClass("btn-primary");
			}
		}

		frm.set_query("asset_unit", "asset_units", function () {
			return {
				filters: { project: frm.doc.project },
			};
		});

		// if (frm.doc.multiple_assets) {
			frm.fields_dict.asset_units.grid.add_custom_button(__("Add Multiple"), function () {
				if (!frm.doc.project) {
					frappe.throw("Please select the Project")
				}
				if (frm.doc.project) {
					frappe.call({
						method: "get_asset_units",
						args: { project: frm.doc.project },
						doc: frm.doc,
						callback: function (r) {
							if (r.message) {
								add_multiple_asset_units(frm, r.message);
							}
						}
					});
				}
			});
		// }
	},

	team: function(frm) {
		frm.call("add_team_members");
	},

	before_cancel: function(frm) {
		return new Promise((resolve, reject) => {
			let d = new frappe.ui.Dialog({
				title: __("Cancel Reason"),
				static: 1,
				fields: [
					{
						label: 'Reason',
						fieldname: 'reason',
						fieldtype: 'Small Text',
						reqd: 1
					},
				],
				primary_action_label: __("Submit"),
				primary_action: async function() {
					frm.workflow_remarks = d.get_value("reason");
					await frappe.db.set_value(frm.doc.doctype, frm.doc.name, "cancel_reason", d.get_value("reason"));
					resolve();
					d.hide();
				},
			});
		});
	}
});



function update_activity(frm) {
	// Get sub-activities related to the parent activity
	let activities = frm.doc.checklist;

	if (activities.length === 0) {
		frappe.msgprint("No Activities found.");
		return;
	}

	let table_html = `
		<style>
			.table-responsive {
				width: 100%;
				overflow-x: auto; /* Horizontal scrolling on small screens */
			}

			/* Table Styling */
			table {
				width: 100%;
				border-collapse: collapse;
				text-align: center;
				table-layout: auto;
			}

			th, td {
				border: 1px solid #ddd;
				padding: 8px;
				text-align: center;
				vertical-align: middle;
				white-space: nowrap; /* Prevents text wrapping */
			}

			/* Rotated Headers with Proper Alignment */
			.rotate-header {
				writing-mode: vertical-rl; /* Vertical text */
				transform: rotate(180deg);
				text-align: center;
				white-space: nowrap;
				width: 40px;
				padding: 5px;
			}

			.remarks_header {
				width: 300px;
				padding: 5px;
			}

			/* Adjust row height for better spacing */
			th {
				height: auto;
			}

			/* Styling for Comment Box (Small Textarea) */
			.remarks {
				width: 100%;
				height: 50px;
				resize: vertical;
				padding: 5px;
				border: none;
				border-radius: 4px;
			}

			/* Mobile Optimization */
			@media screen and (max-width: 768px) {
				th.rotate-header {
					writing-mode: initial; /* Make headers horizontal on mobile */
					transform: rotate(0deg);
					height: auto;
					padding: 2px;
				}

				table {
					display: block;
					overflow-x: auto; /* Enables scrolling */
					white-space: nowrap;
				}

				td, th {
					min-width: 100px; /* Prevents squeezing of columns */
				}

				.comments {
					min-width: 150px;
				}
			}
		</style>

		<div class="table-responsive">
			<table class="table table-bordered">
				<thead>
					<tr>
						<th>Task</th>
						<th class="rotate-header">Completed</th>
						<th class="rotate-header">Not Completed</th>
						<th class="rotate-header">NA</th>
						<th class="remarks_header">Remarks</th>
					</tr>
				</thead>
			<tbody>
	`;

	activities.forEach(sub => {
		table_html += `
			<tr data-sub-id="${sub.name}">
				<td style="text-align:left;">${sub.task}</td>
				<td><input type="checkbox" class="completed" ${sub.completed ? "checked" : ""}></td>
				<td><input type="checkbox" class="not-completed" ${sub.not_completed ? "checked" : ""}></td>
				<td><input type="checkbox" class="na" ${sub.na ? "checked" : ""}></td>
				<td><textarea class="remarks">${sub.remarks || ''}</textarea></td>
			</tr>
		`;
	});

	table_html += `</tbody></table></div>`;

	let d = new frappe.ui.Dialog({
		title: `Update Tasks</b>`,
		size: "extra-large",
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "sub_activity_table",
				options: table_html
			}
		],
		primary_action_label: "Update",
		primary_action() {
			const cdt = "Schedule Cabinet Checklist";
			cur_dialog.$wrapper.find('tr[data-sub-id]').each(function () {
				let sub_id = $(this).attr("data-sub-id");

				let completed = $(this).find(".completed").prop("checked") ? 1 : 0;
				let not_completed = $(this).find(".not-completed").prop("checked") ? 1 : 0;
				let na = $(this).find(".na").prop("checked") ? 1 : 0;
				let remarks = $(this).find(".remarks").val();

				// Update the sub-activity in the child table
				frappe.model.set_value(cdt, sub_id, "completed", completed);
				frappe.model.set_value(cdt, sub_id, "not_completed", not_completed);
				frappe.model.set_value(cdt, sub_id, "na", na);
				frappe.model.set_value(cdt, sub_id, "remarks", remarks);
				frm.save();
			});

			d.hide();
			frm.refresh_field("checklist");
		}
	});

	d.show();
}

function add_multiple_asset_units(frm, units){
	erpnext.utils.remove_empty_first_row(frm, 'asset_units')
	let dialog = new frappe.ui.Dialog({
		title: 'Add Asset Units',
		size: "large",
		fields: [
			{
				label: 'Asset Units',
				fieldname: 'asset_units',
				fieldtype: 'Table',
				cannot_add_rows: true,
				fields: [
					{ fieldtype: 'Link', fieldname: 'asset_unit', label: 'Asset Unit', options: 'Asset Unit', read_only: 1, in_list_view: 1 },
					{ fieldtype: 'Data', fieldname: 'asset_name', label: 'Asset Name', read_only: 1, in_list_view: 1 },
					{ fieldtype: 'Data', fieldname: 'junction_no', label: 'Junction No', read_only: 1,  in_list_view: 1},
				],
				data: units,
			}
		],
		primary_action_label: 'Add',
		primary_action() {
			var selected = dialog.get_field("asset_units").grid.get_selected_children();
			selected.forEach(i=> {
				cur_frm.add_child("asset_units", {
					"asset_unit": i.asset_unit,
					"asset_name": i.asset_name,
				});
			});
			frm.dirty();
			frm.refresh_fields("asset_units");
		}
	});
	dialog.show();
}