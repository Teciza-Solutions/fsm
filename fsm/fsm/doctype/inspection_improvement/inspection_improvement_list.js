frappe.listview_settings['Inspection Improvement'] = {

    onload: function(listview) {
        listview.page.add_inner_button('Download Report', function() {
            let selected_reports = listview.get_checked_items();

            if (selected_reports.length === 0) {
				frappe.msgprint(__('Please select atleast one report.'));
				return;
			}

            let reports = JSON.stringify(selected_reports.map(row => row.name));
			let url = `/api/method/fsm.fsm.doctype.inspection_improvement.inspection_improvement.download_reports?reports=${encodeURIComponent(reports)}`;
			window.open(url);

			listview.clear_checked_items()
			listview.refresh();


        });
    }

};
