// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.ui.form.on('Team Member', {
	user_id: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];

		if (!row.member && !row.member_name && row.user_id) {
			frappe.db.get_value("User", {"name": row.user_id}, "full_name")
			.then(r => {
				if (r.message && r.message.full_name) {
					frappe.model.set_value(cdt, cdn, "member_name", r.message.full_name);
				}
			});
		}
	}
});