// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.listview_settings['Inspection Improvement Request'] = {
	onload: function(listview) {
		listview.page.add_inner_button(__('Download Images'), function () {
            let selected_iir = listview.get_checked_items();

            if (!selected_iir.length) {
                frappe.msgprint(__('Please select at least one Inspection Improvement.'));
                return;
            }

            let iir_names = JSON.stringify(selected_iir.map(row => row.name));
            const params = new URLSearchParams({ doctype: "Inspection Improvement Request", names: iir_names });
            let url = `/api/method/fsm.maintenance_reports.download_maintenance_files?${params}`;
            window.open(url);

            listview.clear_checked_items();
            listview.refresh();
        });
		
		listview.page.add_inner_button('Change Team', function() {
			let selected_schedules = listview.get_checked_items();

			if (selected_schedules.length === 0) {
				frappe.msgprint(__('Please select Schedule first.'));
				return;
			}

			let d = new frappe.ui.Dialog({
				title: 'Assign to Another Team',
				fields: [
					{
						label: 'New Team',
						fieldname: 'team',
						fieldtype: 'Link',
						options: 'Team',
						reqd: 1
					},
				],
				primary_action_label: 'Assign',
				primary_action(values) {
					let schedules = selected_schedules.map(row => row.name);

					frappe.call({
						method: 'fsm.fsm.doctype.schedule_cabinet.schedule_cabinet.change_team_bulkly',
						args: {
							schedules: schedules,
							team: values.team,
							from_task: 0,
							type_: "INS",
						},
						callback: function(response) {
							listview.clear_checked_items()
							frappe.dom.unfreeze(); 
							frappe.msgprint(__(`Assignment in Progress will update shortly...`));
							listview.refresh();
							d.hide();
						},
						error: function () {
							frappe.dom.unfreeze();
						}
					});
				}
			});
			d.show();
		});

		if (frappe.session.user == "Administrator") {
			listview.page.add_inner_button('Reassign Tasks', function() {
				let selected_schedules = listview.get_checked_items();

				if (selected_schedules.length === 0) {
					frappe.msgprint(__('Please select Request first.'));
					return;
				}
				
				let requests = selected_schedules.map(row => row.name);

				frappe.call({
					method: 'fsm.fsm.doctype.inspection_improvement_request.inspection_improvement_request.reassign_bulkly',
					args: {
						requests: requests,
					},
					callback: function(response) {
						listview.clear_checked_items()
						frappe.dom.unfreeze(); 
						frappe.msgprint(__(`Assignment in Progress will update shortly...`));
						listview.refresh();
						d.hide();
					},
					error: function () {
						frappe.dom.unfreeze();
					}
				})
			});
		}
	}
};
