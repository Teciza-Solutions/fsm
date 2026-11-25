// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Asset Unit", {
	refresh(frm) {
		if (frm.doc.latitude && frm.doc.longitude) {
			frm.set_df_property('location', 'options', `
			<iframe width=100% height="300" 
				id="gmap_canvas" 
				src="https://maps.google.com/maps?q=`+ frm.doc.latitude + `,` + frm.doc.longitude + `&t=&z=17&ie=UTF8&iwloc=&output=embed"
				frameborder="0" scrolling="no" marginheight="0" marginwidth="0">
			</iframe>`);
			frm.refresh_field('location');
		}


		if (!frm.is_new()) {
			frm.add_custom_button('Request for Inspection', function () {
				frm.call({
					method: "create_inspection_request",
					doc: frm.doc,
					callback: function (r) {
						var doc = frappe.model.sync(r.message)
						frappe.set_route("Form", doc[0].doctype, doc[0].name);
					}
				})
			}, "Create");

			if (frm.doc.project === "2021-CSS-205" && frm.doc.is_cp23b2) {
				frm.add_custom_button(__('Multi Checklist'), function () {
					show_multi_checklist_dialog(frm);
				}, __("Create"));
			}

			frm.add_custom_button('Sync Task', function () {
				frm.call({
					method: "sync_tasks",
					doc: frm.doc,
					callback: function (r) {
						if (r.message) {
							frappe.show_alert({
								message: __("Tasks are Updated"),
								indicator: "green",
							}, 5);
						}
					}
				})
			});
		}
	},
});

function show_multi_checklist_dialog(frm) {
	const project = "2021-CSS-205";

	frappe.model.with_doctype("Maintenance Checklist Template", function () {
		const dialog = new frappe.ui.form.MultiSelectDialog({
			doctype: "Maintenance Checklist Template",
			target: frm,
			setters: [],
			get_query() {
				return {
					filters: {
						project: project
					}
				};
			},
			size: "large",
			primary_action_label: __("Create Multi Checklist"),
			action(selections) {
				if (!selections || !selections.length) {
					frappe.msgprint(__("Please select at least one Checklist Template."));
					return;
				}
				cur_dialog.hide();
				frm.call({
					method: "create_multi_checklist",
					doc: frm.doc,
					args: {
						templates: selections
					},
					freeze: true,
					freeze_message: __("Creating Multi Checklist..."),
					callback: function (r) {
						if (r.message) {
							var doc = frappe.model.sync(r.message);
							frappe.show_alert({
								message: __("Multi Checklist created successfully"),
								indicator: "green"
							}, 5);
							frappe.set_route("Form", doc[0].doctype, doc[0].name);
						}
					}
				});
			}
		});

		dialog.get_datatable_columns = () => ["name"];

		if (dialog.dialog) {
			dialog.dialog.get_secondary_btn().remove();
			dialog.dialog.set_df_property("search_term", "label", __("Checklist Name"));
			dialog.dialog.$wrapper.find(".list-item--head .list-item__content span").text(__("Checklist Name"));
		} else {
			setTimeout(() => {
				if (dialog.dialog) {
					dialog.dialog.get_secondary_btn().remove();
					dialog.dialog.set_df_property("search_term", "label", __("Checklist Name"));
					dialog.dialog.$wrapper.find(".list-item--head .list-item__content span").text(__("Checklist Name"));
				}
			}, 100);
		}
	});
}

